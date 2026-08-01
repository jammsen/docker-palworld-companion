import { Routes } from "discord.js";
import { CreateOrEditPublisher, type MessageApi } from "./publisher.js";
import type { EmbedPayload, StatusTransport } from "./transport.js";

// Test seam: the discord.js REST surface the bot features actually use.
// A single instance (owned by DiscordBot) is shared across card transport and
// event relay so they queue through one rate-limit manager.
export interface RestLike {
  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
  patch(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
}

export interface BotTransportOptions {
  rest: RestLike;
  /** Getter: the panel can hot-switch the card channel - a switch makes the
   * next edit fail with unknown-message, which heals into a fresh message in
   * the new channel (the old one stays behind, documented) */
  channelId: () => string;
  getMessageId: () => string | undefined;
  setMessageId: (id: string | undefined) => Promise<void>;
}

// Bot mode card publishing: plain REST channel messages - deliberately
// independent of the gateway, so the card (and the final offline edit) work
// even when the websocket is down or already destroyed.
export function createBotTransport(options: BotTransportOptions): StatusTransport {
  const api: MessageApi = {
    create: async (payload: EmbedPayload) => {
      const message = (await options.rest.post(Routes.channelMessages(options.channelId()), {
        body: { embeds: payload.embeds },
      })) as { id: string };
      return message.id;
    },
    edit: async (messageId, payload) => {
      await options.rest.patch(Routes.channelMessage(options.channelId(), messageId), {
        body: { embeds: payload.embeds },
      });
    },
  };
  return new CreateOrEditPublisher({
    api,
    getMessageId: options.getMessageId,
    setMessageId: options.setMessageId,
    label: "bot",
  });
}
