import { WebhookClient } from "discord.js";
import { CreateOrEditPublisher, type MessageApi } from "./publisher.js";
import type { EmbedPayload, StatusTransport } from "./transport.js";

// Test seam: the WebhookClient surface the adapter actually uses
export interface WebhookLike {
  send(options: { embeds: EmbedPayload["embeds"] }): Promise<{ id: string }>;
  editMessage(messageId: string, options: { embeds: EmbedPayload["embeds"] }): Promise<unknown>;
  destroy(): void;
}

export interface WebhookTransportOptions {
  /** Static URL, or a getter for panel-overridable webhook URLs (hot-swap) */
  webhookUrl: string | (() => string);
  getMessageId: () => string | undefined;
  setMessageId: (id: string | undefined) => Promise<void>;
  /** Test seam - a fixed WebhookClient-compatible fake (URL swaps are ignored) */
  client?: WebhookLike;
  /** Test seam - client construction per URL, exercised by hot-swap tests */
  clientFactory?: (url: string) => WebhookLike;
}

// Webhook mode: no bot account needed. discord.js WebhookClient brings proper
// rate-limit queueing (429s are retried, not skipped anymore). One attempt
// with a 10s timeout (retries: 0) keeps the final shutdown edit inside the
// 12s SIGTERM window - two attempts would exceed it.
export function createWebhookTransport(options: WebhookTransportOptions): StatusTransport {
  const resolveUrl = () => (typeof options.webhookUrl === "function" ? options.webhookUrl() : options.webhookUrl);
  const makeClient = (url: string): WebhookLike =>
    options.client ??
    options.clientFactory?.(url) ??
    new WebhookClient({ url }, { rest: { timeout: 10_000, retries: 0 } });
  let currentUrl: string | undefined;
  let client: WebhookLike | undefined;
  // Panel hot-swap: when the effective URL changes between publishes, talk to
  // the new webhook from now on. The stored message id belongs to the old
  // webhook - the next edit 404s and the publisher re-creates the card.
  const activeClient = (): WebhookLike => {
    const url = resolveUrl();
    if (client === undefined || url !== currentUrl) {
      client?.destroy();
      client = makeClient(url);
      currentUrl = url;
    }
    return client;
  };
  const api: MessageApi = {
    create: async (payload) => (await activeClient().send({ embeds: payload.embeds })).id,
    edit: async (messageId, payload) => {
      await activeClient().editMessage(messageId, { embeds: payload.embeds });
    },
    close: () => client?.destroy(),
  };
  return new CreateOrEditPublisher({
    api,
    getMessageId: options.getMessageId,
    setMessageId: options.setMessageId,
    label: "webhook",
  });
}
