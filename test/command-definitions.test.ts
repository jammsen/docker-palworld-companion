import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { COMMAND_DEFINITIONS } from "../src/discord/commands/definitions.js";

describe("COMMAND_DEFINITIONS", () => {
  it("gates the moderation commands behind Manage Server and blocks DMs everywhere", () => {
    const byName = new Map(COMMAND_DEFINITIONS.map((command) => [command.name, command]));
    expect([...byName.keys()].sort()).toEqual(["ban", "kick", "players", "restart", "status", "unban"]);
    for (const command of COMMAND_DEFINITIONS) {
      expect(command.dm_permission).toBe(false);
    }
    for (const name of ["kick", "ban", "unban", "restart"]) {
      expect(byName.get(name)?.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
    }
    for (const name of ["status", "players"]) {
      expect(byName.get(name)?.default_member_permissions).toBeUndefined();
    }
  });

  it("kick/ban take user_id + optional reason, unban only user_id", () => {
    const byName = new Map(COMMAND_DEFINITIONS.map((command) => [command.name, command]));
    for (const name of ["kick", "ban"]) {
      const options = byName.get(name)?.options ?? [];
      expect(options.map((option) => [option.name, option.required])).toEqual([
        ["user_id", true],
        ["reason", false],
      ]);
    }
    expect((byName.get("unban")?.options ?? []).map((option) => option.name)).toEqual(["user_id"]);
  });
});
