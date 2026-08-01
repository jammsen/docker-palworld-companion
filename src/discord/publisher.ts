import type { APIEmbed } from "discord.js";
import { log } from "../logger.js";
import type { DiscordEmbed, EmbedPayload, StatusTransport } from "./transport.js";

// Compile-time drift guard: our embed shape must stay a structural subset of
// discord.js's APIEmbed so payloads pass through both transports unmapped
const assertEmbedCompatible = (embed: DiscordEmbed): APIEmbed => embed;
void assertEmbedCompatible;

// Minimal message API both transports adapt to (WebhookClient / bot REST)
export interface MessageApi {
  /** Create the message and return its id */
  create(payload: EmbedPayload): Promise<string>;
  edit(messageId: string, payload: EmbedPayload): Promise<void>;
  close?(): void;
}

export interface PublisherOptions {
  api: MessageApi;
  getMessageId: () => string | undefined;
  setMessageId: (id: string | undefined) => Promise<void>;
  /** Log label, e.g. "webhook" or "bot" */
  label: string;
}

// Discord's UNKNOWN_MESSAGE error code (DiscordAPIError.code) or a plain 404 -
// duck-typed so tests and both discord.js error shapes match without imports
export function isUnknownMessage(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === 10008 || candidate.status === 404;
}

// Shared create-or-edit core: one persisted message, edited in place; a
// deleted message (or one from the other mode) heals via re-create
export class CreateOrEditPublisher implements StatusTransport {
  constructor(private readonly options: PublisherOptions) {}

  async publish(payload: EmbedPayload): Promise<void> {
    const messageId = this.options.getMessageId();
    if (messageId !== undefined) {
      try {
        await this.options.api.edit(messageId, payload);
        return;
      } catch (error) {
        if (!isUnknownMessage(error)) throw error;
        await this.options.setMessageId(undefined);
      }
    }
    const id = await this.options.api.create(payload);
    await this.options.setMessageId(id);
    log.success(`>>> Discord status card created (${this.options.label} message ${id})`);
  }

  async close(): Promise<void> {
    this.options.api.close?.();
  }
}
