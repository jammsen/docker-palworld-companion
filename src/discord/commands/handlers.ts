import { PermissionFlagsBits } from "discord.js";
import type { DiscordBotMode } from "../../config.js";
import { log } from "../../logger.js";
import type { MetricsCollector } from "../../metrics/collector.js";
import type { PalworldClient } from "../../palworld/client.js";
import { buildStatusCard, sanitizeName } from "../card.js";
import { describeDiscordError } from "../errors.js";
import type { EmbedPayload } from "../transport.js";

/** Discord's ephemeral message flag (MessageFlags.Ephemeral) */
export const EPHEMERAL = 1 << 6;

const SNAPSHOT_MAX_AGE_MS = 10_000;

export interface CommandDeps {
  collector: MetricsCollector;
  palworld: PalworldClient;
  discord: DiscordBotMode;
  fallbackServerName: string;
  /** Effective admin channel (panel runtime override wins over env) - falls back to discord.adminChannelId when absent */
  adminChannelId?: () => string | undefined;
  /** /setup-icons wiring - absent when the icon dir is not available */
  iconSetup?: {
    rest: import("../icon-setup.js").EmojiRestLike;
    /** Available once the gateway is connected */
    applicationId: () => string | undefined;
    iconsDir: string;
    saveTokens: (iconSet: string, tokens: Record<string, string>) => Promise<void>;
  };
}

// Narrow structural view of ChatInputCommandInteraction - handlers never touch
// discord.js beyond enums, so tests drive them with plain stubs
export interface InteractionLike {
  commandName: string;
  channelId: string | null;
  user: { username: string };
  memberPermissions: { has(permission: bigint): boolean } | null;
  options: { getString(name: string): string | null };
  reply(payload: { content?: string; embeds?: EmbedPayload["embeds"]; flags?: number }): Promise<unknown>;
  deferReply(payload?: { flags?: number }): Promise<unknown>;
  editReply(payload: { content?: string; embeds?: EmbedPayload["embeds"] }): Promise<unknown>;
}

// Returns a refusal message, or null when the action may proceed.
// Two trust models:
// - Admin channel configured: whoever can use the command IN that channel may
//   moderate - who that is stays fully in the server owner's hands (channel
//   visibility + the per-command overrides in Server Settings -> Integrations,
//   which can grant the commands to roles without Manage Server). No extra
//   permission recheck here, or that delegation would be impossible; every
//   action still lands in the audit line with its actor.
// - No admin channel: commands work everywhere, so keep the Manage Server
//   recheck as defense in depth on top of default_member_permissions.
function moderationRefusal(deps: CommandDeps, interaction: InteractionLike): string | null {
  const adminChannelId = deps.adminChannelId ? deps.adminChannelId() : deps.discord.adminChannelId;
  if (adminChannelId) {
    if (interaction.channelId !== adminChannelId) {
      return `Moderation commands only work in the admin channel (<#${adminChannelId}>).`;
    }
    return null;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return "You need the **Manage Server** permission for this command.";
  }
  return null;
}

async function recordAdminEvent(
  deps: CommandDeps,
  type: "kick" | "ban" | "unban" | "restart" | "settings",
  target: string | undefined,
  actor: string,
): Promise<void> {
  await deps.collector.recordEvent({ at: Date.now(), type, name: target, newName: actor });
}

/** Resolve a nicer display name for a user id from the last snapshot, if the player is known */
function displayName(deps: CommandDeps, userId: string): string {
  const player = deps.collector.latest()?.players.find((candidate) => candidate.userId === userId);
  return player?.name ?? userId;
}

export async function handleInteraction(deps: CommandDeps, interaction: InteractionLike): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "status": {
        // Defer first: getFresh may wait on the game REST API (up to its
        // timeout), longer than Discord's 3-second interaction window
        await interaction.deferReply();
        const snapshot = await deps.collector.getFresh(SNAPSHOT_MAX_AGE_MS);
        const card = buildStatusCard(
          snapshot,
          snapshot.serverUp ? "online" : "starting",
          snapshot.serverName || deps.fallbackServerName,
          {
            platformEmoji: deps.discord.platformEmoji,
            eventEmoji: deps.discord.eventEmoji,
            eventAmount: deps.discord.eventAmount,
          },
        );
        await interaction.editReply({ embeds: card.embeds });
        return;
      }
      case "players": {
        await interaction.deferReply();
        const snapshot = await deps.collector.getFresh(SNAPSHOT_MAX_AGE_MS);
        if (snapshot.players.length === 0) {
          await interaction.editReply({ content: "No players online." });
          return;
        }
        const lines = snapshot.players.map(
          (player) =>
            `**${sanitizeName(player.name)}** · Lv ${player.level} · ${player.ping.toFixed(0)} ms · \`${player.userId}\``,
        );
        // Stay under Discord's 2000-character message limit: keep whole lines
        // while they fit and state how many players were cut off
        let content = `**Players online (${snapshot.players.length}):**`;
        let shown = 0;
        for (const line of lines) {
          if (`${content}\n${line}`.length > 1960) break;
          content = `${content}\n${line}`;
          shown++;
        }
        if (shown < lines.length) content = `${content}\n…and ${lines.length - shown} more`;
        await interaction.editReply({ content });
        return;
      }
      case "kick":
      case "ban": {
        const refusal = moderationRefusal(deps, interaction);
        if (refusal) {
          await interaction.reply({ content: refusal, flags: EPHEMERAL });
          return;
        }
        const userId = interaction.options.getString("user_id") ?? "";
        const reason =
          interaction.options.getString("reason") ??
          `You have been ${interaction.commandName === "kick" ? "kicked" : "banned"}.`;
        const action =
          interaction.commandName === "kick"
            ? deps.palworld.kick.bind(deps.palworld)
            : deps.palworld.ban.bind(deps.palworld);
        const target = displayName(deps, userId);
        await action(userId, reason);
        await recordAdminEvent(deps, interaction.commandName, target, interaction.user.username);
        await interaction.reply({
          content: `\`${sanitizeName(target)}\` ${interaction.commandName === "kick" ? "kicked" : "banned"}.`,
          flags: EPHEMERAL,
        });
        return;
      }
      case "unban": {
        const refusal = moderationRefusal(deps, interaction);
        if (refusal) {
          await interaction.reply({ content: refusal, flags: EPHEMERAL });
          return;
        }
        const userId = interaction.options.getString("user_id") ?? "";
        await deps.palworld.unban(userId);
        await recordAdminEvent(deps, "unban", userId, interaction.user.username);
        await interaction.reply({ content: `\`${sanitizeName(userId)}\` unbanned.`, flags: EPHEMERAL });
        return;
      }
      case "setup-icons": {
        const refusal = moderationRefusal(deps, interaction);
        if (refusal) {
          await interaction.reply({ content: refusal, flags: EPHEMERAL });
          return;
        }
        const setup = deps.iconSetup;
        if (!setup) {
          await interaction.reply({ content: "Icon setup is not available on this deployment.", flags: EPHEMERAL });
          return;
        }
        const applicationId = setup.applicationId();
        if (applicationId === undefined) {
          await interaction.reply({
            content: "The bot gateway is not connected yet - try again shortly.",
            flags: EPHEMERAL,
          });
          return;
        }
        const style = interaction.options.getString("style") ?? "";
        const { listIconSets, uploadIconSet } = await import("../icon-setup.js");
        const sets = await listIconSets(setup.iconsDir);
        if (!sets.includes(style)) {
          await interaction.reply({
            content: `Unknown icon set \`${sanitizeName(style)}\` - pick one from the autocomplete list.`,
            flags: EPHEMERAL,
          });
          return;
        }
        await interaction.deferReply({ flags: EPHEMERAL });
        const tokens = await uploadIconSet({ rest: setup.rest, applicationId, iconsDir: setup.iconsDir, style });
        await setup.saveTokens(style, tokens);
        await recordAdminEvent(deps, "settings", style, interaction.user.username);
        await interaction.editReply({
          content: `Icon set **${style}** uploaded as ${Object.keys(tokens).length} bot emojis - the status card and event logs use it from the next update.`,
        });
        return;
      }
      case "restart": {
        const refusal = moderationRefusal(deps, interaction);
        if (refusal) {
          await interaction.reply({ content: refusal, flags: EPHEMERAL });
          return;
        }
        // Panel parity: announce -> save -> shutdown -> event
        await interaction.deferReply({ flags: EPHEMERAL });
        await deps.palworld.announce("Server restart requested from Discord");
        await deps.palworld.save();
        await deps.palworld.shutdown(10, "Saving done. Server restarting...");
        await recordAdminEvent(deps, "restart", undefined, interaction.user.username);
        await interaction.editReply({ content: "Restart triggered - world saved, server going down in 10 seconds." });
        return;
      }
      default:
        await interaction.reply({ content: "Unknown command.", flags: EPHEMERAL });
    }
  } catch (error) {
    // An interaction failure must never kill the companion; the log carries
    // the actionable hint, the user reply stays friendly
    log.warn(`>>> Discord command /${interaction.commandName} failed: ${describeDiscordError(error)}`);
    const message =
      interaction.commandName === "setup-icons"
        ? "Icon upload failed - the companion log has the details."
        : "The game server REST API is unreachable - try again when the server is up.";
    await interaction
      .reply({ content: message, flags: EPHEMERAL })
      .catch(() => interaction.editReply({ content: message }).catch(() => undefined));
  }
}

// Narrow structural view of AutocompleteInteraction - same testing rationale
// as InteractionLike
export interface AutocompleteLike {
  commandName: string;
  options: { getFocused(): string };
  respond(choices: Array<{ name: string; value: string }>): Promise<unknown>;
}

/** /setup-icons style autocomplete: filter the shipped sets by the typed text */
export async function handleAutocomplete(deps: CommandDeps, interaction: AutocompleteLike): Promise<void> {
  if (interaction.commandName !== "setup-icons" || !deps.iconSetup) return;
  try {
    const { listIconSets } = await import("../icon-setup.js");
    const sets = await listIconSets(deps.iconSetup.iconsDir);
    const typed = interaction.options.getFocused().toLowerCase();
    const matches = sets.filter((name) => name.includes(typed)).slice(0, 25);
    await interaction.respond(matches.map((name) => ({ name, value: name })));
  } catch (error) {
    // Autocomplete responses expire after 3 seconds - a miss is cosmetic
    log.debug(`setup-icons autocomplete failed: ${String(error)}`);
  }
}
