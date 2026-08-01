import { describe, expect, it } from "vitest";
import { MIN_DISCORD_INTERVAL_SECONDS, parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("disables everything by default", () => {
    const config = parseConfig({});
    expect(config.panel).toBeNull();
    expect(config.discord).toBeNull();
    expect(config.warnings).toHaveLength(0);
  });

  it("derives sidecar paths from GAME_ROOT with a bundled-mode data-dir fallback", () => {
    const config = parseConfig({});
    expect(config.dataDir).toBe("/palworld/companion");
    expect(config.gameEventsFile).toBe("/palworld/game-events.log");
    expect(config.companionEventsFile).toBe("/palworld/companion/companion-events.log");
    expect(config.restapi.host).toBe("127.0.0.1");
  });

  it("honors COMPANION_DATA_DIR and RESTAPI_HOST for the sidecar layout", () => {
    const config = parseConfig({
      GAME_ROOT: "/palworld",
      COMPANION_DATA_DIR: "/data",
      RESTAPI_HOST: "palworld-dedicated-server",
    });
    expect(config.dataDir).toBe("/data");
    expect(config.gameEventsFile).toBe("/palworld/game-events.log");
    expect(config.companionEventsFile).toBe("/data/companion-events.log");
    expect(config.restapi.host).toBe("palworld-dedicated-server");
  });

  it("refuses to enable the panel without a password", () => {
    const config = parseConfig({ PANEL_ENABLED: "true", PANEL_PASSWORD: "" });
    expect(config.panel).toBeNull();
    expect(config.warnings.some((w) => w.includes("PANEL_PASSWORD"))).toBe(true);
  });

  it("enables the panel with defaults applied", () => {
    const config = parseConfig({ PANEL_ENABLED: "true", PANEL_PASSWORD: "secret" });
    expect(config.panel).toEqual({
      username: "admin",
      password: "secret",
      defaultLanguage: "en",
      trustProxy: false,
    });
    expect(config.listenPort).toBe(8213);
  });

  it("falls back to WEBHOOK_URL for the Discord status card", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
    });
    expect(config.discord?.mode).toBe("webhook");
    expect(config.discord?.mode === "webhook" && config.discord.webhookUrl).toBe(
      "https://discord.com/api/webhooks/1/abc",
    );
  });

  it("selects bot mode when a token and a valid channel id are set", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
      DISCORD_LOGS_CHANNEL_ID: "223456789012345678",
      DISCORD_ADMIN_CHANNEL_ID: "323456789012345678",
      DISCORD_GUILD_ID: "423456789012345678",
    });
    expect(config.discord?.mode).toBe("bot");
    if (config.discord?.mode !== "bot") throw new Error("expected bot mode");
    expect(config.discord.channelId).toBe("123456789012345678");
    expect(config.discord.logsChannelId).toBe("223456789012345678");
    expect(config.discord.adminChannelId).toBe("323456789012345678");
    expect(config.discord.guildId).toBe("423456789012345678");
    expect(config.discord.presenceEnabled).toBe(true);
    expect(config.discord.commandsEnabled).toBe(false);
    expect(config.warnings.some((w) => w.includes("DISCORD"))).toBe(false);
  });

  it("falls back to webhook mode when the bot channel id is missing or invalid", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "not-a-snowflake",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
    });
    expect(config.discord?.mode).toBe("webhook");
    expect(config.warnings.some((w) => w.includes("DISCORD_STATUS_CHANNEL_ID"))).toBe(true);
  });

  it("prefers bot mode over a configured webhook URL, with a warning", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
    });
    expect(config.discord?.mode).toBe("bot");
    expect(config.warnings.some((w) => w.includes("DISCORD_STATUS_WEBHOOK_URL is ignored"))).toBe(true);
  });

  it("warns when the live-card channel doubles as logs or admin channel", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
      DISCORD_LOGS_CHANNEL_ID: "123456789012345678",
    });
    expect(config.discord?.mode).toBe("bot");
    expect(config.warnings.some((w) => w.includes("buried"))).toBe(true);
    // Overlap between logs and admin alone is fine - no warning
    const overlapOk = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
      DISCORD_LOGS_CHANNEL_ID: "223456789012345678",
      DISCORD_ADMIN_CHANNEL_ID: "223456789012345678",
    });
    expect(overlapOk.warnings.some((w) => w.includes("buried"))).toBe(false);
  });

  it("clamps the update interval to the mode-specific minimum", () => {
    const webhook = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_STATUS_UPDATE_INTERVAL: "5",
    });
    expect(webhook.discord?.updateIntervalSeconds).toBe(15);
    const bot = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "bot-secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
      DISCORD_STATUS_UPDATE_INTERVAL: "5",
    });
    expect(bot.discord?.updateIntervalSeconds).toBe(10);
    expect(
      bot.discord?.mode === "bot" &&
        parseConfig({
          DISCORD_STATUS_ENABLED: "true",
          DISCORD_BOT_TOKEN: "bot-secret",
          DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
          DISCORD_STATUS_UPDATE_INTERVAL: "12",
        }).discord?.updateIntervalSeconds,
    ).toBe(12);
  });

  it("disables the Discord card without any webhook URL or bot config", () => {
    const config = parseConfig({ DISCORD_STATUS_ENABLED: "true" });
    expect(config.discord).toBeNull();
    expect(config.warnings.some((w) => w.includes("disabling the Discord status card"))).toBe(true);
  });

  it("accepts valid custom platform emojis and rejects malformed ones", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_STATUS_EMOJI_STEAM: "<:steam:1123581321345589012>",
      DISCORD_STATUS_EMOJI_XBOX: "not-an-emoji-token",
    });
    expect(config.discord?.platformEmoji.steam).toBe("<:steam:1123581321345589012>");
    expect(config.discord?.platformEmoji.xbox).toBeUndefined();
    expect(config.warnings.some((w) => w.includes("DISCORD_STATUS_EMOJI_XBOX"))).toBe(true);
  });

  it("accepts custom event emojis including the hyphenated updating-validate", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_STATUS_EMOJI_EVENT_JOIN: "<:pal_join:111>",
      DISCORD_STATUS_EMOJI_EVENT_UPDATING_VALIDATE: "<:pal_updating_validate:222>",
      DISCORD_STATUS_EMOJI_EVENT_BACKUP: "broken",
    });
    expect(config.discord?.eventEmoji.join).toBe("<:pal_join:111>");
    expect(config.discord?.eventEmoji["updating-validate"]).toBe("<:pal_updating_validate:222>");
    expect(config.discord?.eventEmoji.backup).toBeUndefined();
    expect(config.warnings.some((w) => w.includes("EMOJI_EVENT_BACKUP"))).toBe(true);
  });

  it("ships emoji token defaults; empty value opts out to the neutral fallback", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_STATUS_EMOJI_STEAM: "",
      DISCORD_STATUS_EMOJI_EVENT_JOIN: "",
    });
    // Unset -> shipped default token (moved here from the old gameserver-image ENV block)
    expect(config.discord?.platformEmoji.xbox).toBe("<:xbox:1528444823835771020>");
    expect(config.discord?.eventEmoji.backup).toBe("<:pal_sl_backup:1528897223025492132>");
    expect(config.discord?.eventEmoji["updating-validate"]).toBe("<:pal_sl_updatingvalidate:1528897869602492658>");
    // Explicitly empty -> no token, neutral marker/unicode fallback, no warning
    expect(config.discord?.platformEmoji.steam).toBeUndefined();
    expect(config.discord?.eventEmoji.join).toBeUndefined();
    expect(config.warnings.some((w) => w.includes("EMOJI"))).toBe(false);
  });

  it("clamps the event amount to the stored-history range", () => {
    const base = {
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
    };
    expect(parseConfig({ ...base }).discord?.eventAmount).toBe(25);
    expect(parseConfig({ ...base, DISCORD_STATUS_EVENT_AMOUNT: "10" }).discord?.eventAmount).toBe(10);
    expect(parseConfig({ ...base, DISCORD_STATUS_EVENT_AMOUNT: "999" }).discord?.eventAmount).toBe(50);
    expect(parseConfig({ ...base, DISCORD_STATUS_EVENT_AMOUNT: "0" }).discord?.eventAmount).toBe(1);
    expect(
      parseConfig({ ...base, DISCORD_STATUS_EVENT_AMOUNT: "999" }).warnings.some((w) => w.includes("EVENT_AMOUNT")),
    ).toBe(true);
  });

  it("clamps the Discord update interval to the safety minimum", () => {
    const config = parseConfig({
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc",
      DISCORD_STATUS_UPDATE_INTERVAL: "1",
    });
    expect(config.discord?.updateIntervalSeconds).toBe(MIN_DISCORD_INTERVAL_SECONDS);
  });

  it("warns when the event log will lack player events", () => {
    const config = parseConfig({
      PANEL_ENABLED: "true",
      PANEL_PASSWORD: "secret",
      RESTAPI_ENABLED: "true",
      PLAYER_DETECTION_ENABLED: "false",
    });
    expect(config.warnings.some((w) => w.includes("PLAYER_DETECTION_ENABLED"))).toBe(true);
  });

  it("warns when features are on but the REST API is off", () => {
    const config = parseConfig({
      PANEL_ENABLED: "true",
      PANEL_PASSWORD: "secret",
      RESTAPI_ENABLED: "false",
    });
    expect(config.warnings.some((w) => w.includes("RESTAPI_ENABLED"))).toBe(true);
  });
});
