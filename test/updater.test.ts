import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";
import { startDiscordStatus } from "../src/discord/updater.js";
import type { StatusTransport } from "../src/discord/transport.js";
import { MetricsCollector } from "../src/metrics/collector.js";
import { PalworldClient } from "../src/palworld/client.js";
import { StateStore } from "../src/state.js";
import { HostProcMetricsSource } from "../src/sys/metrics-source.js";

describe("startDiscordStatus", () => {
  it("publishes the final offline card BEFORE closing the transport", async () => {
    const gameRoot = await mkdtemp(join(tmpdir(), "companion-updater-"));
    const config = parseConfig({
      GAME_ROOT: gameRoot,
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_STATUS_WEBHOOK_URL: "https://discord.example/api/webhooks/1/token",
    });
    const state = new StateStore(config.dataDir);
    await state.load();
    const collector = new MetricsCollector(
      config,
      new PalworldClient(config.restapi, () => {
        throw new Error("REST not used in this test");
      }),
      state,
      new HostProcMetricsSource(),
    );

    const order: string[] = [];
    const transport: StatusTransport = {
      publish: vi.fn(async () => {
        order.push("publish");
      }),
      close: vi.fn(async () => {
        order.push("close");
      }),
    };

    const stop = await startDiscordStatus(config, { collector, state, transport });
    await stop();

    // First tick publish + final offline publish, then exactly one close - last
    expect(order.filter((entry) => entry === "close")).toHaveLength(1);
    expect(order.at(-1)).toBe("close");
    expect((transport.publish as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses bot mode without an injected transport", async () => {
    const gameRoot = await mkdtemp(join(tmpdir(), "companion-updater-"));
    const config = parseConfig({
      GAME_ROOT: gameRoot,
      DISCORD_STATUS_ENABLED: "true",
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
    });
    const state = new StateStore(config.dataDir);
    await state.load();
    const collector = new MetricsCollector(
      config,
      new PalworldClient(config.restapi, () => {
        throw new Error("REST not used in this test");
      }),
      state,
      new HostProcMetricsSource(),
    );
    await expect(startDiscordStatus(config, { collector, state })).rejects.toThrow("bot mode");
  });
});
