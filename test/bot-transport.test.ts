import { describe, expect, it, vi } from "vitest";
import { createBotTransport, type RestLike } from "../src/discord/bot-transport.js";
import type { EmbedPayload } from "../src/discord/transport.js";

const PAYLOAD: EmbedPayload = { embeds: [{ title: "t", color: 1, fields: [] }] };
const CHANNEL = "123456789012345678";

function makeTransport(rest: RestLike, initialId?: string) {
  let messageId = initialId;
  const transport = createBotTransport({
    rest,
    channelId: () => CHANNEL,
    getMessageId: () => messageId,
    setMessageId: async (id) => {
      messageId = id;
    },
  });
  return { transport, id: () => messageId };
}

describe("createBotTransport", () => {
  it("POSTs to the channel on first publish and stores the message id", async () => {
    const rest: RestLike = { post: vi.fn().mockResolvedValue({ id: "b1" }), patch: vi.fn() };
    const { transport, id } = makeTransport(rest);
    await transport.publish(PAYLOAD);
    expect(rest.post).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages`, { body: { embeds: PAYLOAD.embeds } });
    expect(id()).toBe("b1");
  });

  it("PATCHes the stored message on subsequent publishes", async () => {
    const rest: RestLike = { post: vi.fn(), patch: vi.fn().mockResolvedValue({}) };
    const { transport } = makeTransport(rest, "b1");
    await transport.publish(PAYLOAD);
    expect(rest.patch).toHaveBeenCalledWith(`/channels/${CHANNEL}/messages/b1`, { body: { embeds: PAYLOAD.embeds } });
    expect(rest.post).not.toHaveBeenCalled();
  });

  it("re-posts when the stored message is unknown (deleted or other-mode)", async () => {
    const rest: RestLike = {
      post: vi.fn().mockResolvedValue({ id: "b2" }),
      patch: vi.fn().mockRejectedValue({ code: 10008 }),
    };
    const { transport, id } = makeTransport(rest, "b1");
    await transport.publish(PAYLOAD);
    expect(id()).toBe("b2");
  });
});
