import { describe, expect, it, vi } from "vitest";
import { createWebhookTransport, type WebhookLike } from "../src/discord/webhook.js";
import type { EmbedPayload } from "../src/discord/transport.js";

const PAYLOAD: EmbedPayload = { embeds: [{ title: "t", color: 1, fields: [] }] };

function makeTransport(client: WebhookLike, initialId?: string) {
  let messageId = initialId;
  const transport = createWebhookTransport({
    webhookUrl: "https://discord.example/api/webhooks/1/token",
    getMessageId: () => messageId,
    setMessageId: async (id) => {
      messageId = id;
    },
    client,
  });
  return { transport, id: () => messageId };
}

describe("createWebhookTransport", () => {
  it("sends via the webhook client on first publish and stores the returned id", async () => {
    const client: WebhookLike = {
      send: vi.fn().mockResolvedValue({ id: "w1" }),
      editMessage: vi.fn(),
      destroy: vi.fn(),
    };
    const { transport, id } = makeTransport(client);
    await transport.publish(PAYLOAD);
    expect(client.send).toHaveBeenCalledWith({ embeds: PAYLOAD.embeds });
    expect(id()).toBe("w1");
  });

  it("edits the stored message on subsequent publishes", async () => {
    const client: WebhookLike = {
      send: vi.fn(),
      editMessage: vi.fn().mockResolvedValue({}),
      destroy: vi.fn(),
    };
    const { transport } = makeTransport(client, "w1");
    await transport.publish(PAYLOAD);
    expect(client.editMessage).toHaveBeenCalledWith("w1", { embeds: PAYLOAD.embeds });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("re-posts when the stored message was deleted", async () => {
    const client: WebhookLike = {
      send: vi.fn().mockResolvedValue({ id: "w2" }),
      editMessage: vi.fn().mockRejectedValue({ code: 10008 }),
      destroy: vi.fn(),
    };
    const { transport, id } = makeTransport(client, "w1");
    await transport.publish(PAYLOAD);
    expect(id()).toBe("w2");
  });

  it("close() destroys the underlying client", async () => {
    const client: WebhookLike = {
      send: vi.fn().mockResolvedValue({ id: "w1" }),
      editMessage: vi.fn(),
      destroy: vi.fn(),
    };
    const { transport } = makeTransport(client);
    await transport.publish(PAYLOAD); // client is created lazily on first publish
    await transport.close?.();
    expect(client.destroy).toHaveBeenCalled();
  });

  it("hot-swaps the client when the URL getter changes (panel override)", async () => {
    const clients: Array<WebhookLike & { url: string }> = [];
    const makeClient = (url: string): WebhookLike => {
      const client = {
        url,
        send: vi.fn().mockResolvedValue({ id: `msg-${clients.length}` }),
        editMessage: vi.fn().mockResolvedValue({}),
        destroy: vi.fn(),
      };
      clients.push(client);
      return client;
    };
    let url = "https://discord.com/api/webhooks/1/first";
    let messageId: string | undefined;
    const transport = createWebhookTransport({
      webhookUrl: () => url,
      getMessageId: () => messageId,
      setMessageId: async (id) => {
        messageId = id;
      },
      clientFactory: makeClient,
    });

    await transport.publish(PAYLOAD);
    await transport.publish(PAYLOAD);
    expect(clients).toHaveLength(1); // same URL -> same client reused

    url = "https://discord.com/api/webhooks/2/second";
    await transport.publish(PAYLOAD);
    expect(clients).toHaveLength(2); // new URL -> new client
    expect(clients[0]!.destroy).toHaveBeenCalled(); // old one torn down
    expect(clients[1]!.url).toBe(url);
  });
});
