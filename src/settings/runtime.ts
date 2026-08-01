import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DiscordBotMode, DiscordWebhookMode } from "../config.js";
import { MIN_DISCORD_BOT_INTERVAL_SECONDS, MIN_DISCORD_INTERVAL_SECONDS } from "../config.js";
import { log } from "../logger.js";

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/** Discord webhook URLs incl. the ptb/canary hosts and legacy discordapp.com */
export const WEBHOOK_URL_PATTERN = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/\S+$/;

// Panel-written runtime overrides for companion-owned settings (the game
// settings have their own store/precedence). Precedence: env < override -
// same rule as everywhere else in the panel.
export interface DiscordRuntimeOverrides {
  statusChannelId?: string;
  logsChannelId?: string;
  adminChannelId?: string;
  presenceEnabled?: boolean;
  /** Restart-applied: command registration happens at gateway connect */
  commandsEnabled?: boolean;
  updateIntervalSeconds?: number;
  /** Webhook mode only */
  webhookUrl?: string;
}

export interface CompanionRuntimeSettings {
  discord?: DiscordRuntimeOverrides;
  /** Set by /setup-icons: uploaded application-emoji tokens per event type */
  eventEmojiTokens?: Record<string, string>;
  /** The icon set the tokens came from - informational */
  iconSet?: string;
}

// companion-settings.json on the companion data volume - atomic writes like
// state.json; the gameserver never reads this file
export class RuntimeSettingsStore {
  private readonly filePath: string;
  private settings: CompanionRuntimeSettings = {};
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, "companion-settings.json");
  }

  async load(): Promise<CompanionRuntimeSettings> {
    try {
      this.settings = JSON.parse(await readFile(this.filePath, "utf8")) as CompanionRuntimeSettings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(`>>> ${this.filePath} could not be read - starting with no runtime overrides: ${String(error)}`);
      }
      this.settings = {};
    }
    return this.settings;
  }

  get(): CompanionRuntimeSettings {
    return this.settings;
  }

  /** Replace the /setup-icons result as a whole (one upload = one consistent set) */
  async setEventEmojiTokens(iconSet: string, tokens: Record<string, string>): Promise<void> {
    this.settings = { ...this.settings, iconSet, eventEmojiTokens: tokens };
    await this.persist();
  }

  /** Replace the discord override group as a whole (the panel form posts all fields) */
  async setDiscord(overrides: DiscordRuntimeOverrides): Promise<void> {
    this.settings = { ...this.settings, discord: overrides };
    await this.persist();
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.settings, null, 2);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
        const tmpPath = `${this.filePath}.tmp`;
        // 0600 like state.json: a persisted webhookUrl override is a credential
        await writeFile(tmpPath, snapshot, { encoding: "utf8", mode: 0o600 });
        await rename(tmpPath, this.filePath);
      });
    await this.writeQueue;
  }
}

// Hot-apply view: transports/relays/presence read through these getters every
// tick, so panel changes take effect at the next update. Invalid persisted
// values are ignored defensively (the routes validate on write already).
export interface DiscordRuntime {
  statusChannelId(): string;
  logsChannelId(): string | undefined;
  adminChannelId(): string | undefined;
  presenceEnabled(): boolean;
  updateIntervalSeconds(): number;
  /** Read at gateway connect only - documented as restart-applied */
  commandsEnabled(): boolean;
}

export function createDiscordRuntime(base: DiscordBotMode, store: RuntimeSettingsStore): DiscordRuntime {
  const overrides = (): DiscordRuntimeOverrides => store.get().discord ?? {};
  const channel = (value: string | undefined, fallback: string | undefined): string | undefined =>
    value !== undefined && SNOWFLAKE_PATTERN.test(value) ? value : fallback;
  return {
    statusChannelId: () => channel(overrides().statusChannelId, undefined) ?? base.channelId,
    logsChannelId: () => channel(overrides().logsChannelId, base.logsChannelId),
    adminChannelId: () => channel(overrides().adminChannelId, base.adminChannelId),
    presenceEnabled: () => overrides().presenceEnabled ?? base.presenceEnabled,
    updateIntervalSeconds: () => {
      const requested = overrides().updateIntervalSeconds;
      if (requested === undefined || !Number.isFinite(requested)) return base.updateIntervalSeconds;
      return Math.max(Math.floor(requested), MIN_DISCORD_BOT_INTERVAL_SECONDS);
    },
    commandsEnabled: () => overrides().commandsEnabled ?? base.commandsEnabled,
  };
}

// Webhook-mode counterpart: URL and interval are the only runtime knobs.
// A URL change is picked up by the transport at the next publish; the old
// card message heals through the unknown-message re-create.
export interface WebhookRuntime {
  webhookUrl(): string;
  updateIntervalSeconds(): number;
}

export function createWebhookRuntime(base: DiscordWebhookMode, store: RuntimeSettingsStore): WebhookRuntime {
  const overrides = (): DiscordRuntimeOverrides => store.get().discord ?? {};
  return {
    webhookUrl: () => {
      const value = overrides().webhookUrl;
      return value !== undefined && WEBHOOK_URL_PATTERN.test(value) ? value : base.webhookUrl;
    },
    updateIntervalSeconds: () => {
      const requested = overrides().updateIntervalSeconds;
      if (requested === undefined || !Number.isFinite(requested)) return base.updateIntervalSeconds;
      return Math.max(Math.floor(requested), MIN_DISCORD_INTERVAL_SECONDS);
    },
  };
}
