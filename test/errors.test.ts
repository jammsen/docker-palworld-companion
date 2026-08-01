import { describe, expect, it } from "vitest";
import { describeDiscordError } from "../src/discord/errors.js";

class FakeDiscordAPIError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscordAPIError";
  }
}

describe("describeDiscordError", () => {
  it("appends the channel-access hint for 50001 Missing Access", () => {
    const described = describeDiscordError(new FakeDiscordAPIError(50001, "Missing Access"));
    expect(described).toContain("Missing Access");
    expect(described).toContain("View Channel, Send Messages and Embed Links");
  });

  it("appends the permission hint for 50013 Missing Permissions", () => {
    const described = describeDiscordError(new FakeDiscordAPIError(50013, "Missing Permissions"));
    expect(described).toContain("lacks permissions");
  });

  it("appends the channel-id hint for 10003 Unknown Channel", () => {
    const described = describeDiscordError(new FakeDiscordAPIError(10003, "Unknown Channel"));
    expect(described).toContain("Copy Channel ID");
  });

  it("appends the token hint for HTTP 401", () => {
    const error = Object.assign(new Error("401: Unauthorized"), { status: 401 });
    expect(describeDiscordError(error)).toContain("DISCORD_BOT_TOKEN");
  });

  it("passes unknown errors through unchanged", () => {
    expect(describeDiscordError(new Error("fetch failed"))).toBe("Error: fetch failed");
    expect(describeDiscordError("plain string")).toBe("plain string");
  });
});
