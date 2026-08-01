import { lchownSync, mkdirSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { findDefaultCredentials, parseConfig } from "./config.js";
import { log, setDebug } from "./logger.js";
import { createApp, createHealthApp } from "./web/app.js";

// Bind mounts are created root-owned by Docker on first start, so the image
// starts as root: make the data dir writable for PUID:PGID, then become that
// user - the same PUID/PGID contract as the gameserver image. A container
// started as a non-root user (compose `user:`) skips this entirely.
function dropPrivileges(dataDir: string): void {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  const parseId = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const uid = parseId(process.env.PUID, 1000);
  const gid = parseId(process.env.PGID, 1000);
  if (uid === 0) return;
  try {
    mkdirSync(dataDir, { recursive: true });
    // lchown only, never dereference: a symlink planted in the data dir must
    // not redirect the chown to a target outside of it
    lchownSync(dataDir, uid, gid);
    for (const entry of readdirSync(dataDir, { recursive: true, withFileTypes: true })) {
      lchownSync(join(entry.parentPath, entry.name), uid, gid);
    }
    process.setgroups?.([gid]);
    process.setgid?.(gid);
    process.setuid?.(uid);
    log.info(`>>> Started as root - data dir chowned to ${uid}:${gid}, privileges dropped`);
  } catch (error) {
    log.warn(`>>> Could not drop privileges to ${uid}:${gid} - continuing as root (${String(error)})`);
  }
}

// Injected by build.mjs; fallback keeps `tsx watch` working in dev
declare const COMPANION_VERSION: string | undefined;
const VERSION = typeof COMPANION_VERSION === "string" ? COMPANION_VERSION : "dev";

if (process.argv.includes("--version")) {
  console.log(`palworld-companion ${VERSION}`);
  process.exit(0);
}

const config = parseConfig(process.env);
setDebug(config.debug);

log.info(">>> Starting companion service");
log.base(`> palworld-companion ${VERSION}`);

// Same pre-flight as the gameserver image (includes/security.sh): refuse to
// run with the shipped placeholder credentials
for (const offender of findDefaultCredentials(process.env)) {
  log.error(`>>> Security threat detected: Please change the default ${offender} value. Aborting companion start ...`);
  process.exit(1);
}

dropPrivileges(config.dataDir);

for (const warning of config.warnings) {
  log.warn(`>>> ${warning}`);
}

log.info(
  `>>> Features: web panel ${config.panel ? "enabled" : "disabled"}, discord status ${
    config.discord ? `enabled (${config.discord.mode} mode)` : "disabled"
  }`,
);

if (!config.panel && !config.discord) {
  // Idling is the shipped default (the compose example starts the companion
  // with all features off) - keep the health endpoint up so the container
  // stays healthy, and say once how to turn features on.
  log.warn(
    ">>> All features are disabled - the companion idles. Enable PANEL_ENABLED and/or DISCORD_STATUS_ENABLED in your default.env (if you expected a feature to be on, check the warnings above)",
  );
  const app = createHealthApp(config, VERSION);
  const server = serve({ fetch: app.fetch, port: config.listenPort, hostname: "0.0.0.0" }, (info) => {
    log.info(`>>> Health endpoint listening on port ${info.port}`);
  });
  const shutdown = (signal: string) => {
    log.warn(`>>> Companion service received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} else {
  await mkdir(config.dataDir, { recursive: true });

  const { StateStore } = await import("./state.js");
  const { PalworldClient } = await import("./palworld/client.js");
  const { MetricsCollector } = await import("./metrics/collector.js");
  const { HostProcMetricsSource } = await import("./sys/metrics-source.js");

  const state = new StateStore(config.dataDir);
  await state.load();
  const client = new PalworldClient(config.restapi);
  const collector = new MetricsCollector(config, client, state, new HostProcMetricsSource());

  const shutdownHooks: Array<() => Promise<void> | void> = [];

  // Panel-editable runtime overrides (companion-settings.json), both Discord
  // modes: created before the panel so its Discord page can edit them
  let discordSettings: import("./web/app.js").DiscordSettingsDeps | undefined;
  if (config.discord) {
    const { RuntimeSettingsStore, createDiscordRuntime, createWebhookRuntime } = await import("./settings/runtime.js");
    const runtimeStore = new RuntimeSettingsStore(config.dataDir);
    await runtimeStore.load();
    discordSettings =
      config.discord.mode === "bot"
        ? {
            mode: "bot",
            store: runtimeStore,
            base: config.discord,
            runtime: createDiscordRuntime(config.discord, runtimeStore),
          }
        : {
            mode: "webhook",
            store: runtimeStore,
            base: config.discord,
            runtime: createWebhookRuntime(config.discord, runtimeStore),
          };
  }

  // The HTTP listener is always on: with the panel it serves the full app, in
  // Discord-only deployments just /api/health - so a container healthcheck
  // works no matter which feature is enabled
  let app: { fetch: Parameters<typeof serve>[0]["fetch"] };
  if (config.panel) {
    const { AuthService } = await import("./web/auth.js");
    const { SettingsStore } = await import("./settings/store.js");
    const secret = await AuthService.ensureSecret(state);
    const auth = new AuthService(secret, config.panel.username, config.panel.password);
    const settings = new SettingsStore(config.dataDir, process.env);
    // Raw env snapshot for the Discord page's transparency view: the inactive
    // mode's values (and the gameserver's WEBHOOK_ENABLED) stay visible even
    // though only the active mode is editable
    const boolEnv = (value: string | undefined) => (value ?? "").toLowerCase() === "true";
    const discordEnv: import("./web/app.js").DiscordEnvView = {
      webhookUrl: process.env.DISCORD_STATUS_WEBHOOK_URL || process.env.WEBHOOK_URL || "",
      statusChannelId: process.env.DISCORD_STATUS_CHANNEL_ID ?? "",
      logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID ?? "",
      adminChannelId: process.env.DISCORD_ADMIN_CHANNEL_ID ?? "",
      updateIntervalSeconds: process.env.DISCORD_STATUS_UPDATE_INTERVAL || "30",
      presenceEnabled:
        process.env.DISCORD_PRESENCE_ENABLED === undefined ? true : boolEnv(process.env.DISCORD_PRESENCE_ENABLED),
      commandsEnabled: boolEnv(process.env.DISCORD_COMMANDS_ENABLED),
      gameserverWebhookEnabled: boolEnv(process.env.WEBHOOK_ENABLED),
    };
    app = createApp(config, VERSION, { auth, collector, settings, client, discordSettings, discordEnv });
  } else {
    app = createHealthApp(config, VERSION);
  }
  const server = serve({ fetch: app.fetch, port: config.listenPort, hostname: "0.0.0.0" }, (info) => {
    if (config.panel)
      log.success(`>>> Web panel listening on port ${info.port} - open http://<your-server-ip>:${info.port}`);
    else log.info(`>>> Health endpoint listening on port ${info.port} (panel disabled)`);
  });
  shutdownHooks.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

  if (config.discord) {
    const { startDiscordStatus } = await import("./discord/updater.js");
    if (config.discord.mode === "bot") {
      const discord = config.discord;
      const { DiscordBot } = await import("./discord/bot.js");
      const { createBotTransport } = await import("./discord/bot-transport.js");
      const { isAdminActionEvent } = await import("./events.js");
      if (discordSettings?.mode !== "bot")
        throw new Error("bot mode wiring requires the runtime settings created above");
      const runtime = discordSettings.runtime;

      let commands: typeof import("./discord/commands/definitions.js").COMMAND_DEFINITIONS | undefined;
      let onInteraction:
        | ((interaction: import("./discord/commands/handlers.js").InteractionLike) => Promise<void>)
        | undefined;
      if (runtime.commandsEnabled() && discord.guildId) {
        const { COMMAND_DEFINITIONS } = await import("./discord/commands/definitions.js");
        const { handleInteraction } = await import("./discord/commands/handlers.js");
        const deps = {
          collector,
          palworld: client,
          discord,
          fallbackServerName: config.serverName,
          // Same hot-apply getter as the audit relay - a panel-set admin
          // channel must restrict commands too, not only route the audit
          adminChannelId: () => runtime.adminChannelId(),
        };
        commands = COMMAND_DEFINITIONS;
        onInteraction = (interaction: import("./discord/commands/handlers.js").InteractionLike) =>
          handleInteraction(deps, interaction);
      } else if (runtime.commandsEnabled()) {
        log.warn(
          ">>> Slash commands are enabled but DISCORD_GUILD_ID is missing - commands stay off (set your server id and restart the companion)",
        );
      } else {
        log.info(
          ">>> Slash commands are disabled (DISCORD_COMMANDS_ENABLED / panel toggle) - enabling them requires a companion restart",
        );
      }
      const bot = new DiscordBot({ botToken: discord.botToken, commands, guildId: discord.guildId, onInteraction });
      await bot.start(); // best-effort gateway; REST features work regardless

      const transport = createBotTransport({
        rest: bot.rest,
        channelId: () => runtime.statusChannelId(),
        getMessageId: () => state.get().discordBotMessageId,
        setMessageId: (id) => state.update({ discordBotMessageId: id }),
      });
      const { PresenceUpdater } = await import("./discord/presence.js");
      const presence = new PresenceUpdater(bot, () => runtime.presenceEnabled());
      const { EventRelay } = await import("./discord/event-relay.js");
      const { renderAuditLine } = await import("./discord/card.js");
      // Both relays always exist in bot mode - their channel getters decide
      // per tick whether they are active (panel can hot-enable them)
      const eventRelay = new EventRelay({
        rest: bot.rest,
        channelId: () => runtime.logsChannelId(),
        eventEmoji: discord.eventEmoji,
        getCursor: () => state.get().discordLogsLastEventKey,
        setCursor: (key) => state.update({ discordLogsLastEventKey: key }),
        // Admin actions live in the admin channel (with actor detail) when
        // one is configured - avoids double lines when admin = logs
        filter: (event) => (runtime.adminChannelId() ? !isAdminActionEvent(event) : true),
      });
      const auditRelay = new EventRelay({
        rest: bot.rest,
        channelId: () => runtime.adminChannelId(),
        eventEmoji: discord.eventEmoji,
        getCursor: () => state.get().discordAdminLastEventKey,
        setCursor: (key) => state.update({ discordAdminLastEventKey: key }),
        filter: isAdminActionEvent,
        render: renderAuditLine,
      });
      const stop = await startDiscordStatus(config, {
        collector,
        state,
        transport,
        presence,
        eventRelay,
        auditRelay,
        runtimeInterval: () => runtime.updateIntervalSeconds(),
      });
      // ONE composite hook: hooks run concurrently, so only composition
      // guarantees the final offline edit happens before the gateway dies
      shutdownHooks.push(async () => {
        await stop();
        await bot.destroy();
      });
    } else {
      if (discordSettings?.mode !== "webhook")
        throw new Error("webhook mode wiring requires the runtime settings created above");
      const webhookRuntime = discordSettings.runtime;
      const { createWebhookTransport } = await import("./discord/webhook.js");
      // URL and interval through the runtime getters, so panel overrides
      // hot-apply exactly like in bot mode
      const transport = createWebhookTransport({
        webhookUrl: () => webhookRuntime.webhookUrl(),
        getMessageId: () => state.get().discordMessageId,
        setMessageId: (id) => state.update({ discordMessageId: id }),
      });
      const stop = await startDiscordStatus(config, {
        collector,
        state,
        transport,
        runtimeInterval: () => webhookRuntime.updateIntervalSeconds(),
      });
      shutdownHooks.push(stop);
    }
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn(`>>> Companion service received ${signal}, shutting down`);
    // Give hooks (final Discord "offline" edit, server close) enough budget to
    // cover one full webhook request (10s AbortSignal timeout) plus overhead;
    // Promise.race exits immediately when the hooks finish sooner.
    const budget = new Promise((resolve) => setTimeout(resolve, 12_000));
    // Async wrapper turns a synchronously-throwing hook into a rejection so
    // one bad hook cannot bypass allSettled and skip the others
    await Promise.race([Promise.allSettled(shutdownHooks.map(async (hook) => hook())), budget]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
