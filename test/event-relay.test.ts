import { describe, expect, it, vi } from "vitest";
import { EventRelay } from "../src/discord/event-relay.js";
import { eventKey, type ServerEvent } from "../src/events.js";

const CHANNEL = "123456789012345678";
const EVENTS: ServerEvent[] = [
  { at: 1_752_000_000_000, type: "starting", source: "game" },
  { at: 1_752_000_060_000, type: "join", name: "Alice", source: "game" },
  { at: 1_752_000_120_000, type: "backup", source: "game" },
];

function makeRelay(post: ReturnType<typeof vi.fn>, initialCursor?: string) {
  let cursor = initialCursor;
  const relay = new EventRelay({
    rest: { post, patch: vi.fn() },
    channelId: () => CHANNEL,
    eventEmoji: {},
    getCursor: () => cursor,
    setCursor: async (key) => {
      cursor = key;
    },
  });
  return { relay, cursor: () => cursor };
}

describe("EventRelay", () => {
  it("anchors at the newest event on first activation without posting history", async () => {
    const post = vi.fn();
    const { relay, cursor } = makeRelay(post);
    await relay.publish(EVENTS);
    expect(post).not.toHaveBeenCalled();
    expect(cursor()).toBe(eventKey(EVENTS[2]!));
  });

  it("posts only events after the cursor and advances it per success", async () => {
    const post = vi.fn().mockResolvedValue({});
    const { relay, cursor } = makeRelay(post, eventKey(EVENTS[0]!));
    await relay.publish(EVENTS);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]![0]).toBe(`/channels/${CHANNEL}/messages`);
    expect(String(post.mock.calls[0]![1].body.content)).toContain("Alice");
    expect(cursor()).toBe(eventKey(EVENTS[2]!));
  });

  it("stops at a failed post and retries it next tick", async () => {
    const post = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom"));
    const { relay, cursor } = makeRelay(post, eventKey(EVENTS[0]!));
    await relay.publish(EVENTS);
    // First post (join) succeeded, second (backup) failed -> cursor sits on join
    expect(cursor()).toBe(eventKey(EVENTS[1]!));
  });

  it("re-anchors without posting when the cursor rotated out of the window", async () => {
    const post = vi.fn();
    const { relay, cursor } = makeRelay(post, "999|gone|");
    await relay.publish(EVENTS);
    expect(post).not.toHaveBeenCalled();
    expect(cursor()).toBe(eventKey(EVENTS[2]!));
  });

  it("advances the cursor past filtered events without posting them", async () => {
    const post = vi.fn().mockResolvedValue({});
    let cursor: string | undefined = eventKey(EVENTS[0]!);
    const relay = new EventRelay({
      rest: { post, patch: vi.fn() },
      channelId: () => CHANNEL,
      eventEmoji: {},
      getCursor: () => cursor,
      setCursor: async (key) => {
        cursor = key;
      },
      filter: (event) => event.type === "backup",
    });
    await relay.publish(EVENTS);
    expect(post).toHaveBeenCalledTimes(1); // only the backup event
    expect(cursor).toBe(eventKey(EVENTS[2]!)); // but cursor passed the join too
  });

  it("uses a custom renderer when provided (audit lines with actor)", async () => {
    const post = vi.fn().mockResolvedValue({});
    let cursor: string | undefined = "";
    const relay = new EventRelay({
      rest: { post, patch: vi.fn() },
      channelId: () => CHANNEL,
      eventEmoji: {},
      getCursor: () => cursor,
      setCursor: async (key) => {
        cursor = key;
      },
      render: () => "AUDIT-LINE",
    });
    await relay.publish([EVENTS[0]!]);
    expect(post.mock.calls[0]![1].body.content).toBe("AUDIT-LINE");
  });
});
