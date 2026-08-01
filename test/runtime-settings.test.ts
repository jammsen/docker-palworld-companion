import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { createDiscordRuntime, createWebhookRuntime, RuntimeSettingsStore } from "../src/settings/runtime.js";

async function makeBase() {
  const dir = await mkdtemp(join(tmpdir(), "companion-runtime-"));
  const config = parseConfig({
    GAME_ROOT: dir,
    DISCORD_STATUS_ENABLED: "true",
    DISCORD_BOT_TOKEN: "secret",
    DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
    DISCORD_LOGS_CHANNEL_ID: "223456789012345678",
  });
  if (config.discord?.mode !== "bot") throw new Error("expected bot mode");
  return { dir, base: config.discord };
}

describe("RuntimeSettingsStore", () => {
  it("persists the discord group atomically and survives a reload", async () => {
    const { dir } = await makeBase();
    const store = new RuntimeSettingsStore(dir);
    await store.load();
    await store.setDiscord({ statusChannelId: "323456789012345678", presenceEnabled: false });
    const reloaded = new RuntimeSettingsStore(dir);
    await reloaded.load();
    expect(reloaded.get().discord).toEqual({ statusChannelId: "323456789012345678", presenceEnabled: false });
    const raw = JSON.parse(await readFile(join(dir, "companion-settings.json"), "utf8"));
    expect(raw.discord.statusChannelId).toBe("323456789012345678");
  });

  it("starts empty when the file is missing", async () => {
    const { dir } = await makeBase();
    const store = new RuntimeSettingsStore(dir);
    expect(await store.load()).toEqual({});
  });
});

describe("createDiscordRuntime", () => {
  it("overrides win over env, empty overrides fall back to env", async () => {
    const { dir, base } = await makeBase();
    const store = new RuntimeSettingsStore(dir);
    await store.load();
    const runtime = createDiscordRuntime(base, store);

    // No overrides: env values
    expect(runtime.statusChannelId()).toBe("123456789012345678");
    expect(runtime.logsChannelId()).toBe("223456789012345678");
    expect(runtime.adminChannelId()).toBeUndefined();
    expect(runtime.presenceEnabled()).toBe(true);
    expect(runtime.updateIntervalSeconds()).toBe(30);

    await store.setDiscord({
      statusChannelId: "323456789012345678",
      adminChannelId: "423456789012345678",
      presenceEnabled: false,
      updateIntervalSeconds: 12,
    });
    expect(runtime.statusChannelId()).toBe("323456789012345678");
    expect(runtime.logsChannelId()).toBe("223456789012345678"); // untouched -> env
    expect(runtime.adminChannelId()).toBe("423456789012345678");
    expect(runtime.presenceEnabled()).toBe(false);
    expect(runtime.updateIntervalSeconds()).toBe(12);
  });

  it("ignores invalid persisted values and clamps the interval", async () => {
    const { dir, base } = await makeBase();
    const store = new RuntimeSettingsStore(dir);
    await store.load();
    await store.setDiscord({ statusChannelId: "not-a-snowflake", updateIntervalSeconds: 3 });
    const runtime = createDiscordRuntime(base, store);
    expect(runtime.statusChannelId()).toBe("123456789012345678"); // invalid override -> env
    expect(runtime.updateIntervalSeconds()).toBe(10); // clamped to bot minimum
  });
});

async function makeWebhookBase() {
  const dir = await mkdtemp(join(tmpdir(), "companion-runtime-"));
  const config = parseConfig({
    GAME_ROOT: dir,
    DISCORD_STATUS_ENABLED: "true",
    DISCORD_STATUS_WEBHOOK_URL: "https://discord.com/api/webhooks/111/env-token",
  });
  if (config.discord?.mode !== "webhook") throw new Error("expected webhook mode");
  return { dir, base: config.discord };
}

describe("createWebhookRuntime", () => {
  it("overrides URL and interval, empty/absent falls back to env", async () => {
    const { dir, base } = await makeWebhookBase();
    const store = new RuntimeSettingsStore(dir);
    await store.load();
    const runtime = createWebhookRuntime(base, store);
    expect(runtime.webhookUrl()).toBe("https://discord.com/api/webhooks/111/env-token");
    expect(runtime.updateIntervalSeconds()).toBe(30);

    await store.setDiscord({ webhookUrl: "https://discord.com/api/webhooks/222/panel-token", updateIntervalSeconds: 20 });
    expect(runtime.webhookUrl()).toBe("https://discord.com/api/webhooks/222/panel-token");
    expect(runtime.updateIntervalSeconds()).toBe(20);

    await store.setDiscord({});
    expect(runtime.webhookUrl()).toBe("https://discord.com/api/webhooks/111/env-token");
  });

  it("ignores a persisted non-webhook URL and clamps the interval to the webhook minimum", async () => {
    const { dir, base } = await makeWebhookBase();
    const store = new RuntimeSettingsStore(dir);
    await store.load();
    await store.setDiscord({ webhookUrl: "https://evil.example/api/webhooks/1/x", updateIntervalSeconds: 5 });
    const runtime = createWebhookRuntime(base, store);
    expect(runtime.webhookUrl()).toBe("https://discord.com/api/webhooks/111/env-token"); // invalid override -> env
    expect(runtime.updateIntervalSeconds()).toBe(15); // clamped to webhook minimum
  });
});
