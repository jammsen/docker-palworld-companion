import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EmojiRestLike } from "../src/discord/icon-setup.js";
import { emojiNameFor, listIconSets, uploadIconSet } from "../src/discord/icon-setup.js";
import { ALL_EVENT_TYPES } from "../src/events.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function makeIconsDir(sets: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "companion-icons-"));
  for (const set of sets) {
    await mkdir(join(dir, set), { recursive: true });
    for (const event of ALL_EVENT_TYPES) {
      await writeFile(join(dir, set, `${event}.png`), PNG_BYTES);
    }
  }
  // A directory that is not an icon set must not be listed
  await mkdir(join(dir, "not-a-set"), { recursive: true });
  return dir;
}

function makeRest(existing: Array<{ id: string; name: string }> = []) {
  const calls: Array<{ method: string; route: string; body?: unknown }> = [];
  let nextId = 100;
  const rest: EmojiRestLike = {
    get: async (route) => {
      calls.push({ method: "GET", route });
      return { items: existing };
    },
    post: async (route, options) => {
      calls.push({ method: "POST", route, body: options.body });
      const body = options.body as { name: string };
      return { id: String(nextId++), name: body.name };
    },
    patch: async () => undefined,
    delete: async (route) => {
      calls.push({ method: "DELETE", route });
      return undefined;
    },
  };
  return { rest, calls };
}

describe("listIconSets", () => {
  it("lists only directories that contain icons", async () => {
    const dir = await makeIconsDir(["modern-slate", "cool-ember"]);
    expect(await listIconSets(dir)).toEqual(["cool-ember", "modern-slate"]);
  });

  it("returns empty for a missing directory", async () => {
    expect(await listIconSets("/does/not/exist")).toEqual([]);
  });
});

describe("uploadIconSet", () => {
  it("uploads one application emoji per event type and returns the tokens", async () => {
    const dir = await makeIconsDir(["modern-slate"]);
    const { rest, calls } = makeRest([]);
    const tokens = await uploadIconSet({ rest, applicationId: "app1", iconsDir: dir, style: "modern-slate" });
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(ALL_EVENT_TYPES.length);
    expect(posts.every((call) => call.route === "/applications/app1/emojis")).toBe(true);
    const joinBody = posts[0]?.body as { name: string; image: string };
    expect(joinBody.name).toBe("pw_join");
    expect(joinBody.image.startsWith("data:image/png;base64,")).toBe(true);
    expect(tokens.join).toMatch(/^<:pw_join:\d+>$/);
    expect(tokens["updating-validate"]).toMatch(/^<:pw_updating_validate:\d+>$/);
    expect(Object.keys(tokens)).toHaveLength(ALL_EVENT_TYPES.length);
  });

  it("replaces companion-managed emojis from an earlier run", async () => {
    const dir = await makeIconsDir(["cool-ember"]);
    const { rest, calls } = makeRest([
      { id: "1", name: "pw_join" },
      { id: "2", name: "unrelated_emoji" },
    ]);
    await uploadIconSet({ rest, applicationId: "app1", iconsDir: dir, style: "cool-ember" });
    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toEqual([{ method: "DELETE", route: "/applications/app1/emojis/1" }]);
  });
});

describe("emojiNameFor", () => {
  it("maps hyphenated event types to valid emoji names", () => {
    expect(emojiNameFor("updating-validate")).toBe("pw_updating_validate");
    expect(emojiNameFor("join")).toBe("pw_join");
  });
});
