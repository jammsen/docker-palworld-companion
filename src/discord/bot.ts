import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { log } from "../logger.js";
import type { AutocompleteLike, InteractionLike } from "./commands/handlers.js";
import type { EmojiRestLike } from "./icon-setup.js";
import type { Activity, PresenceTarget } from "./presence.js";

export interface DiscordBotOptions {
  botToken: string;
  /** Slash commands to register (guild-scoped bulk overwrite on ready) - Phase B */
  commands?: RESTPostAPIChatInputApplicationCommandsJSONBody[];
  guildId?: string;
  onInteraction?: (interaction: InteractionLike) => Promise<void>;
  onAutocomplete?: (interaction: AutocompleteLike) => Promise<void>;
}

// Owns the two Discord connections of bot mode:
// - a REST manager (shared by the card transport and the event relays so all
//   queue through one rate limiter) - works without any gateway connection
// - the gateway Client (websocket): presence and slash-command interactions
export class DiscordBot implements PresenceTarget {
  /** Superset of RestLike: get/delete are needed by /setup-icons' app-emoji routes */
  readonly rest: EmojiRestLike;
  private client: Client | null = null;

  constructor(private readonly options: DiscordBotOptions) {
    // One attempt with a 10s timeout (retries: 0): same per-request budget as
    // the webhook path, so the final shutdown edit stays inside the 12s
    // SIGTERM window - a retry would double the worst case past the budget
    this.rest = new REST({ timeout: 10_000, retries: 0 }).setToken(options.botToken);
  }

  // Gateway is best-effort: on login failure the card and event relays keep
  // working over REST - only presence and slash commands are lost
  async start(): Promise<void> {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once(Events.ClientReady, (readyClient) => {
      log.success(`>>> Discord bot gateway connected as ${readyClient.user.tag}`);
      const { commands, guildId } = this.options;
      if (commands && guildId) {
        // Bulk overwrite is idempotent - safe on every startup
        readyClient.application.commands
          .set(commands, guildId)
          .then(() => log.success(`>>> Registered ${commands.length} slash commands in guild ${guildId}`))
          .catch((error) => log.warn(`>>> Slash-command registration failed: ${String(error)}`));
      }
    });
    const { onInteraction, onAutocomplete } = this.options;
    if (onInteraction || onAutocomplete) {
      client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand() && onInteraction) void onInteraction(interaction);
        else if (interaction.isAutocomplete() && onAutocomplete) void onAutocomplete(interaction);
      });
    }
    try {
      await client.login(this.options.botToken);
      this.client = client;
    } catch (error) {
      log.warn(
        `>>> Discord bot gateway login failed - status card and event log continue via REST, presence/commands unavailable: ${String(error)}`,
      );
      await client.destroy().catch(() => undefined);
    }
  }

  /** Available once the gateway is connected - /setup-icons needs it for the app-emoji routes */
  applicationId(): string | undefined {
    return this.client?.application?.id ?? undefined;
  }

  setActivity(activity: Activity): void {
    this.client?.user?.setPresence({
      status: activity.status,
      activities: activity.text ? [{ type: ActivityType.Custom, name: "status", state: activity.text }] : [],
    });
  }

  async destroy(): Promise<void> {
    // Closing the websocket flips the bot member to offline in Discord
    await this.client?.destroy();
    this.client = null;
  }
}
