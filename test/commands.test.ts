import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type DiscordBotMode, parseConfig } from "../src/config.js";
import {
  type CommandDeps,
  EPHEMERAL,
  handleAutocomplete,
  handleInteraction,
  type InteractionLike,
} from "../src/discord/commands/handlers.js";
import type { EmojiRestLike } from "../src/discord/icon-setup.js";
import { ALL_EVENT_TYPES } from "../src/events.js";
import { MetricsCollector } from "../src/metrics/collector.js";
import { PalworldClient } from "../src/palworld/client.js";
import { StateStore } from "../src/state.js";
import { HostProcMetricsSource } from "../src/sys/metrics-source.js";

const ADMIN_CHANNEL = "323456789012345678";

async function makeIconsDir(sets: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "companion-cmd-icons-"));
  for (const set of sets) {
    await mkdir(join(dir, set), { recursive: true });
    for (const event of ALL_EVENT_TYPES) {
      await writeFile(join(dir, set, `${event}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }
  }
  return dir;
}

function makeEmojiRest(): EmojiRestLike {
  let nextId = 500;
  return {
    get: async () => ({ items: [] }),
    post: async (_route, options) => {
      const body = options.body as { name: string };
      return { id: String(nextId++), name: body.name };
    },
    patch: async () => undefined,
    delete: async () => undefined,
  };
}

async function makeDeps(overrides: Partial<DiscordBotMode> = {}): Promise<CommandDeps & { palworldCalls: string[] }> {
  const gameRoot = await mkdtemp(join(tmpdir(), "companion-commands-"));
  const config = parseConfig({
    GAME_ROOT: gameRoot,
    DISCORD_STATUS_ENABLED: "true",
    DISCORD_BOT_TOKEN: "secret",
    DISCORD_STATUS_CHANNEL_ID: "123456789012345678",
    DISCORD_ADMIN_CHANNEL_ID: ADMIN_CHANNEL,
  });
  if (config.discord?.mode !== "bot") throw new Error("expected bot mode");
  const state = new StateStore(config.dataDir);
  await state.load();
  const palworldCalls: string[] = [];
  const palworld = new PalworldClient(config.restapi, async (url, init) => {
    palworldCalls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const collector = new MetricsCollector(config, palworld, state, new HostProcMetricsSource());
  return {
    collector,
    palworld,
    discord: { ...config.discord, ...overrides },
    fallbackServerName: "Test",
    palworldCalls,
  };
}

function makeInteraction(
  commandName: string,
  overrides: Partial<InteractionLike> = {},
): InteractionLike & { replies: unknown[]; edits: unknown[] } {
  const replies: unknown[] = [];
  const edits: unknown[] = [];
  return {
    commandName,
    channelId: ADMIN_CHANNEL,
    user: { username: "TestAdmin" },
    memberPermissions: { has: () => true },
    options: { getString: () => null },
    reply: async (payload) => {
      replies.push(payload);
    },
    deferReply: async () => undefined,
    editReply: async (payload) => {
      edits.push(payload);
    },
    replies,
    edits,
    ...overrides,
  };
}

describe("handleInteraction", () => {
  it("refuses moderation commands outside the admin channel, ephemeral", async () => {
    const deps = await makeDeps();
    const interaction = makeInteraction("kick", { channelId: "999999999999999999" });
    await handleInteraction(deps, interaction);
    const reply = interaction.replies[0] as { content: string; flags: number };
    expect(reply.content).toContain("admin channel");
    expect(reply.flags).toBe(EPHEMERAL);
    expect(deps.palworldCalls).toHaveLength(0);
  });

  it("refuses moderation without Manage Server when NO admin channel is configured", async () => {
    const deps = await makeDeps({ adminChannelId: undefined });
    const interaction = makeInteraction("ban", { memberPermissions: { has: () => false } });
    await handleInteraction(deps, interaction);
    const reply = interaction.replies[0] as { content: string; flags: number };
    expect(reply.content).toContain("Manage Server");
    expect(deps.palworldCalls).toHaveLength(0);
  });

  it("allows moderation in the admin channel without Manage Server (channel trust model)", async () => {
    // The server owner decides who is in/can use the admin channel (channel
    // visibility + Integrations overrides) - no extra permission recheck
    const deps = await makeDeps();
    const interaction = makeInteraction("ban", {
      memberPermissions: { has: () => false },
      options: { getString: (name) => (name === "user_id" ? "steam_123" : null) },
    });
    await handleInteraction(deps, interaction);
    expect(deps.palworldCalls.some((call) => call.includes("ban"))).toBe(true);
  });

  it("kick calls the game API, records an actor event and replies ephemeral", async () => {
    const deps = await makeDeps();
    const interaction = makeInteraction("kick", {
      options: { getString: (name) => (name === "user_id" ? "steam_123" : null) },
    });
    await handleInteraction(deps, interaction);
    expect(deps.palworldCalls.some((call) => call.includes("kick"))).toBe(true);
    const events = deps.collector.latest();
    // recordEvent persisted to companion-events.log; latest() may be null pre-collect -
    // assert via a fresh snapshot instead
    void events;
    const snapshot = await deps.collector.collect();
    const kickEvent = snapshot.events.find((event) => event.type === "kick");
    expect(kickEvent?.name).toBe("steam_123");
    expect(kickEvent?.newName).toBe("TestAdmin");
    const reply = interaction.replies[0] as { flags: number };
    expect(reply.flags).toBe(EPHEMERAL);
  });

  it("restart runs announce -> save -> shutdown in order and records the actor", async () => {
    const deps = await makeDeps();
    const interaction = makeInteraction("restart");
    await handleInteraction(deps, interaction);
    const order = deps.palworldCalls.map((call) => call.split("/").at(-1));
    expect(order).toEqual(["announce", "save", "shutdown"]);
    const snapshot = await deps.collector.collect();
    const restartEvent = snapshot.events.find((event) => event.type === "restart");
    expect(restartEvent?.newName).toBe("TestAdmin");
    expect(interaction.edits.length).toBe(1);
  });

  it("commands work anywhere when no admin channel is configured", async () => {
    const deps = await makeDeps({ adminChannelId: undefined });
    const interaction = makeInteraction("unban", {
      channelId: "999999999999999999",
      options: { getString: () => "steam_456" },
    });
    await handleInteraction(deps, interaction);
    expect(deps.palworldCalls.some((call) => call.includes("unban"))).toBe(true);
  });

  it("the runtime admin-channel getter overrides the env value (panel hot-apply)", async () => {
    // Env has no admin channel, but the panel set one at runtime - the
    // restriction must follow the getter, not the static config
    const deps = await makeDeps({ adminChannelId: undefined });
    deps.adminChannelId = () => "111111111111111111";
    const interaction = makeInteraction("unban", {
      channelId: "999999999999999999",
      options: { getString: () => "steam_456" },
    });
    await handleInteraction(deps, interaction);
    expect(deps.palworldCalls.some((call) => call.includes("unban"))).toBe(false);
    const refusal = interaction.replies[0] as { content: string; flags: number };
    expect(refusal.content).toContain("111111111111111111");
    expect(refusal.flags).toBe(EPHEMERAL);
  });

  it("replies with a friendly ephemeral error when the game REST API is down", async () => {
    const deps = await makeDeps();
    const brokenDeps = {
      ...deps,
      palworld: new PalworldClient(
        { enabled: true, host: "127.0.0.1", port: 1, timeoutSeconds: 1, adminPassword: "x" },
        () => {
          throw new Error("connect ECONNREFUSED");
        },
      ),
    };
    const interaction = makeInteraction("kick", {
      options: { getString: (name) => (name === "user_id" ? "steam_123" : null) },
    });
    await handleInteraction(brokenDeps, interaction);
    const reply = interaction.replies[0] as { content: string; flags: number };
    expect(reply.content).toContain("unreachable");
    expect(reply.flags).toBe(EPHEMERAL);
  });

  it("/players defers, lists names with ids publicly and has an empty-state", async () => {
    const deps = await makeDeps();
    const interaction = makeInteraction("players");
    await handleInteraction(deps, interaction);
    // Deferred first (snapshot refresh can exceed Discord's 3s window), so
    // the answer arrives as an edit of the deferred reply
    expect(interaction.replies).toHaveLength(0);
    const edit = interaction.edits[0] as { content: string };
    expect(edit.content).toBe("No players online.");
  });

  it("/status defers and edits in the status-card embeds publicly", async () => {
    const deps = await makeDeps();
    const interaction = makeInteraction("status");
    await handleInteraction(deps, interaction);
    expect(interaction.replies).toHaveLength(0);
    const edit = interaction.edits[0] as { embeds?: unknown[] };
    expect(edit.embeds?.length).toBeGreaterThan(0);
  });

  it("/setup-icons uploads the chosen set, saves the tokens and records the actor", async () => {
    const deps = await makeDeps();
    const iconsDir = await makeIconsDir(["modern-slate"]);
    const saved: Array<{ iconSet: string; tokens: Record<string, string> }> = [];
    const withSetup = {
      ...deps,
      iconSetup: {
        rest: makeEmojiRest(),
        applicationId: () => "app1",
        iconsDir,
        saveTokens: async (iconSet: string, tokens: Record<string, string>) => {
          saved.push({ iconSet, tokens });
        },
      },
    };
    const interaction = makeInteraction("setup-icons", {
      options: { getString: (name) => (name === "style" ? "modern-slate" : null) },
    });
    await handleInteraction(withSetup, interaction);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.iconSet).toBe("modern-slate");
    expect(saved[0]?.tokens.join).toMatch(/^<:pw_join:\d+>$/);
    const edit = interaction.edits[0] as { content: string };
    expect(edit.content).toContain("modern-slate");
    const snapshot = await deps.collector.collect();
    const settingsEvent = snapshot.events.find((event) => event.type === "settings");
    expect(settingsEvent?.newName).toBe("TestAdmin");
  });

  it("/setup-icons refuses an unknown style and waits for the gateway", async () => {
    const deps = await makeDeps();
    const iconsDir = await makeIconsDir(["modern-slate"]);
    const setup = {
      rest: makeEmojiRest(),
      applicationId: () => "app1" as string | undefined,
      iconsDir,
      saveTokens: async () => {},
    };
    const unknown = makeInteraction("setup-icons", {
      options: { getString: () => "no-such-set" },
    });
    await handleInteraction({ ...deps, iconSetup: setup }, unknown);
    expect((unknown.replies[0] as { content: string }).content).toContain("Unknown icon set");

    const offline = makeInteraction("setup-icons", {
      options: { getString: () => "modern-slate" },
    });
    await handleInteraction({ ...deps, iconSetup: { ...setup, applicationId: () => undefined } }, offline);
    expect((offline.replies[0] as { content: string }).content).toContain("not connected");
  });

  it("setup-icons style autocomplete filters the shipped sets", async () => {
    const deps = await makeDeps();
    const iconsDir = await makeIconsDir(["modern-slate", "cool-ember", "pal-sphere-ultra"]);
    const withSetup = {
      ...deps,
      iconSetup: {
        rest: makeEmojiRest(),
        applicationId: () => "app1",
        iconsDir,
        saveTokens: async () => {},
      },
    };
    const responses: Array<Array<{ name: string; value: string }>> = [];
    await handleAutocomplete(withSetup, {
      commandName: "setup-icons",
      options: { getFocused: () => "sphere" },
      respond: async (choices) => {
        responses.push(choices);
      },
    });
    expect(responses[0]).toEqual([{ name: "pal-sphere-ultra", value: "pal-sphere-ultra" }]);
  });
});
