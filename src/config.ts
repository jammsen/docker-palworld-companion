// Typed parsing and validation of the container environment.
// Validation rules live here (not in bash) to keep the shell wiring minimal.
import { ALL_EVENT_TYPES, EVENT_LOG_CAPACITY } from "./events.js";

export interface CompanionConfig {
  debug: boolean;
  /** Companion-owned writable directory (state.json, companion-events.log, settings-overrides.env) */
  dataDir: string;
  /** Gameserver volume - mounted read-only when running as a sidecar */
  gameRoot: string;
  /** Event log written by the gameserver (read-only for the companion) */
  gameEventsFile: string;
  /** Event log for the companion's own events (restart, settings, REST up/down) */
  companionEventsFile: string;
  /** HTTP port (PANEL_PORT) - always served for /api/health, panel routes only when enabled */
  listenPort: number;
  panel: PanelConfig | null;
  discord: DiscordStatusConfig | null;
  restapi: RestApiConfig;
  serverName: string;
  serverSettingsMode: string;
  gameSettingsFile: string;
  banlistFile: string;
  /**
   * Ordering/comment template for the settings export, provided by the
   * gameserver on the game volume at boot - so any gameserver image can supply
   * its own. Export falls back to schema order when the file is absent.
   */
  envTemplateFile: string;
  /** Reason strings for features that were requested but could not be enabled */
  warnings: string[];
}

export interface PanelConfig {
  username: string;
  password: string;
  defaultLanguage: string;
  /** Honor X-Forwarded-* headers - only safe behind a reverse proxy */
  trustProxy: boolean;
}

export interface DiscordStatusConfig {
  webhookUrl: string;
  updateIntervalSeconds: number;
  /** Custom <:name:id> emoji per platform prefix (steam, xbox, ps5, mac) */
  platformEmoji: Partial<Record<string, string>>;
  /** Custom <:name:id> emoji per event type, replacing the unicode defaults on the card */
  eventEmoji: Partial<Record<string, string>>;
  /** How many events the card's last-events field shows (1..EVENT_LOG_CAPACITY) */
  eventAmount: number;
}

export interface RestApiConfig {
  enabled: boolean;
  /** Hostname of the gameserver's REST API - the gameserver service name when running as a sidecar */
  host: string;
  port: number;
  timeoutSeconds: number;
  adminPassword: string;
}

export const MIN_DISCORD_INTERVAL_SECONDS = 15;

// Shipped emoji defaults (previously ENV defaults of the bundled gameserver
// image). Semantics: variable unset -> default token, set to empty -> neutral
// marker/unicode fallback. CAVEAT: the tokens render from the maintainer's
// Discord server - see ENV_VARS.md for uploading your own.
const DEFAULT_PLATFORM_EMOJI: Record<string, string> = {
  steam: "<:steam:1528444768697192488>",
  xbox: "<:xbox:1528444823835771020>",
  ps5: "<:ps5:1528444879695515748>",
  mac: "<:mac:1528444932132700332>",
};

// The icons/modern-slate set
const DEFAULT_EVENT_EMOJI: Partial<Record<string, string>> = {
  join: "<:pal_sl_join:1528897301907771460>",
  leave: "<:pal_sl_leave:1528897336162648066>",
  rename: "<:pal_sl_rename:1528897568212258976>",
  online: "<:pal_sl_online:1528897465263067176>",
  offline: "<:pal_sl_offline:1528897375215550644>",
  starting: "<:pal_sl_starting:1528897750966599853>",
  installing: "<:pal_sl_installing:1528897264519479570>",
  updating: "<:pal_sl_updating:1528897841152393368>",
  "updating-validate": "<:pal_sl_updatingvalidate:1528897869602492658>",
  stopping: "<:pal_sl_stopping:1528897784508453025>",
  restart: "<:pal_sl_restart:1528897601775210536>",
  backup: "<:pal_sl_backup:1528897223025492132>",
  settings: "<:pal_sl_settings:1528897681290956951>",
};

function envBool(value: string | undefined): boolean {
  return (value ?? "").toLowerCase() === "true";
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseConfig(env: Record<string, string | undefined>): CompanionConfig {
  const warnings: string[] = [];
  const gameRoot = env.GAME_ROOT || "/palworld";

  const envPort = (key: string, fallback: number): number => {
    const parsed = envInt(env[key], fallback);
    if (parsed >= 1 && parsed <= 65535) return parsed;
    warnings.push(`${key}=${env[key]} is not a valid port (1-65535) - using ${fallback}`);
    return fallback;
  };
  const envSeconds = (key: string, fallback: number): number => {
    const parsed = envInt(env[key], fallback);
    if (parsed >= 1) return parsed;
    warnings.push(`${key}=${env[key]} is not a positive number of seconds - using ${fallback}`);
    return fallback;
  };

  let panel: PanelConfig | null = null;
  if (envBool(env.PANEL_ENABLED)) {
    const password = env.PANEL_PASSWORD ?? "";
    if (password.length === 0) {
      warnings.push(
        "PANEL_ENABLED is true but PANEL_PASSWORD is empty - refusing to start the web panel without a password",
      );
    } else {
      panel = {
        username: env.PANEL_USERNAME || "admin",
        password,
        defaultLanguage: env.PANEL_DEFAULT_LANGUAGE || "en",
        trustProxy: envBool(env.PANEL_TRUST_PROXY),
      };
    }
  }

  let discord: DiscordStatusConfig | null = null;
  if (envBool(env.DISCORD_STATUS_ENABLED)) {
    const webhookUrl = env.DISCORD_STATUS_WEBHOOK_URL || env.WEBHOOK_URL || "";
    if (webhookUrl.length === 0) {
      warnings.push(
        "DISCORD_STATUS_ENABLED is true but neither DISCORD_STATUS_WEBHOOK_URL nor WEBHOOK_URL is set - disabling the Discord status card",
      );
    } else {
      const requested = envInt(env.DISCORD_STATUS_UPDATE_INTERVAL, 30);
      const updateIntervalSeconds = Math.max(requested, MIN_DISCORD_INTERVAL_SECONDS);
      if (updateIntervalSeconds !== requested) {
        warnings.push(
          `DISCORD_STATUS_UPDATE_INTERVAL=${requested} is below the webhook rate-limit safety minimum - clamped to ${MIN_DISCORD_INTERVAL_SECONDS} seconds`,
        );
      }
      const platformEmoji: Partial<Record<string, string>> = {};
      for (const platform of ["steam", "xbox", "ps5", "mac"] as const) {
        const value = env[`DISCORD_STATUS_EMOJI_${platform.toUpperCase()}`] ?? DEFAULT_PLATFORM_EMOJI[platform];
        if (!value) continue;
        if (/^<a?:\w+:\d+>$/.test(value)) {
          platformEmoji[platform] = value;
        } else {
          warnings.push(
            `DISCORD_STATUS_EMOJI_${platform.toUpperCase()} is not a valid Discord emoji token (expected <:name:id>) - using the default marker`,
          );
        }
      }
      const eventEmoji: Partial<Record<string, string>> = {};
      for (const type of ALL_EVENT_TYPES) {
        const key = `DISCORD_STATUS_EMOJI_EVENT_${type.toUpperCase().replaceAll("-", "_")}`;
        const value = env[key] ?? DEFAULT_EVENT_EMOJI[type];
        if (!value) continue;
        if (/^<a?:\w+:\d+>$/.test(value)) {
          eventEmoji[type] = value;
        } else {
          warnings.push(`${key} is not a valid Discord emoji token (expected <:name:id>) - using the unicode default`);
        }
      }

      const requestedEvents = envInt(env.DISCORD_STATUS_EVENT_AMOUNT, 25);
      const eventAmount = Math.min(Math.max(requestedEvents, 1), EVENT_LOG_CAPACITY);
      if (eventAmount !== requestedEvents) {
        warnings.push(
          `DISCORD_STATUS_EVENT_AMOUNT=${requestedEvents} is outside the valid range 1-${EVENT_LOG_CAPACITY} - clamped to ${eventAmount}`,
        );
      }
      discord = { webhookUrl, updateIntervalSeconds, platformEmoji, eventEmoji, eventAmount };
    }
  }

  const restapi: RestApiConfig = {
    enabled: envBool(env.RESTAPI_ENABLED),
    host: env.RESTAPI_HOST || "127.0.0.1",
    port: envPort("RESTAPI_PORT", 8212),
    timeoutSeconds: envSeconds("RESTAPI_TIMEOUT", 10),
    adminPassword: env.ADMIN_PASSWORD ?? "",
  };

  if ((panel || discord) && !restapi.enabled) {
    warnings.push(
      "RESTAPI_ENABLED is not true - game data (players, metrics, actions) will be unavailable to the companion service",
    );
  }

  // Player events come exclusively from the shell player-detection loop
  // (single source of truth) - without it the event log has no joins/leaves
  if ((panel || discord) && restapi.enabled && !envBool(env.PLAYER_DETECTION_ENABLED)) {
    warnings.push(
      "PLAYER_DETECTION_ENABLED is not true - player join/leave/rename events will not appear in the event log",
    );
  }

  const dataDir = env.COMPANION_DATA_DIR || `${gameRoot}/companion`;

  return {
    debug: envBool(env.COMPANION_DEBUG),
    dataDir,
    gameRoot,
    gameEventsFile: `${gameRoot}/game-events.log`,
    companionEventsFile: `${dataDir}/companion-events.log`,
    listenPort: envPort("PANEL_PORT", 8213),
    panel,
    discord,
    restapi,
    serverName: env.SERVER_NAME || "Palworld Dedicated Server",
    serverSettingsMode: (env.SERVER_SETTINGS_MODE || "manual").toLowerCase(),
    gameSettingsFile: env.GAME_SETTINGS_FILE || `${gameRoot}/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini`,
    banlistFile: `${env.GAME_SAVE_PATH || `${gameRoot}/Pal/Saved`}/SaveGames/banlist.txt`,
    envTemplateFile: env.COMPANION_ENV_TEMPLATE || `${gameRoot}/default.env.template`,
    warnings,
  };
}
