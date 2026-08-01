import { describe, expect, it, vi } from "vitest";
import { formatActivity, PresenceUpdater } from "../src/discord/presence.js";
import type { StatusSnapshot } from "../src/metrics/collector.js";

function makeSnapshot(players: number, max: number, days: number): StatusSnapshot {
  return {
    at: Date.now(),
    serverUp: true,
    game: {
      serverfps: 60,
      currentplayernum: players,
      serverframetime: 16,
      maxplayernum: max,
      uptime: 1000,
      days,
    },
    players: [],
    serverName: "Test",
    cpuCorePercents: [],
    ram: { usedBytes: 0, totalBytes: 0 },
    lastRestartAt: null,
    events: [],
  };
}

describe("formatActivity", () => {
  it("maps the three card states to presence text and status", () => {
    expect(formatActivity(makeSnapshot(12, 32, 47), "online")).toEqual({
      text: "12/32 players · Day 47",
      status: "online",
    });
    expect(formatActivity(null, "starting")).toEqual({ text: "Server starting…", status: "idle" });
    expect(formatActivity(makeSnapshot(1, 2, 3), "offline")).toEqual({ text: "Server offline", status: "dnd" });
  });

  it("treats a missing game payload as starting even when marked online", () => {
    const snapshot = { ...makeSnapshot(0, 0, 0), game: null };
    expect(formatActivity(snapshot, "online").status).toBe("idle");
  });
});

describe("PresenceUpdater", () => {
  it("pushes only when the text changes and swallows target errors", () => {
    const setActivity = vi.fn();
    const updater = new PresenceUpdater({ setActivity });
    updater.publish(makeSnapshot(1, 8, 2), "online");
    updater.publish(makeSnapshot(1, 8, 2), "online"); // identical -> no second push
    expect(setActivity).toHaveBeenCalledTimes(1);
    updater.publish(makeSnapshot(2, 8, 2), "online");
    expect(setActivity).toHaveBeenCalledTimes(2);

    const throwing = new PresenceUpdater({
      setActivity: () => {
        throw new Error("gateway down");
      },
    });
    expect(() => throwing.publish(makeSnapshot(1, 8, 2), "online")).not.toThrow();
  });
});
