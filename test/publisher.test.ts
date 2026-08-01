import { describe, expect, it, vi } from "vitest";
import { CreateOrEditPublisher, isUnknownMessage, type MessageApi } from "../src/discord/publisher.js";
import type { EmbedPayload } from "../src/discord/transport.js";

const PAYLOAD: EmbedPayload = { embeds: [{ title: "t", color: 1, fields: [] }] };

function makePublisher(api: MessageApi, initialId?: string) {
  let messageId = initialId;
  const publisher = new CreateOrEditPublisher({
    api,
    getMessageId: () => messageId,
    setMessageId: async (id) => {
      messageId = id;
    },
    label: "test",
  });
  return { publisher, id: () => messageId };
}

describe("CreateOrEditPublisher", () => {
  it("creates on first publish and stores the message id", async () => {
    const api = { create: vi.fn().mockResolvedValue("m1"), edit: vi.fn() };
    const { publisher, id } = makePublisher(api);
    await publisher.publish(PAYLOAD);
    expect(api.create).toHaveBeenCalledWith(PAYLOAD);
    expect(api.edit).not.toHaveBeenCalled();
    expect(id()).toBe("m1");
  });

  it("edits in place once an id is stored", async () => {
    const api = { create: vi.fn(), edit: vi.fn().mockResolvedValue(undefined) };
    const { publisher, id } = makePublisher(api, "m1");
    await publisher.publish(PAYLOAD);
    expect(api.edit).toHaveBeenCalledWith("m1", PAYLOAD);
    expect(api.create).not.toHaveBeenCalled();
    expect(id()).toBe("m1");
  });

  it("recovers from a deleted message by re-creating", async () => {
    const api = {
      create: vi.fn().mockResolvedValue("m2"),
      edit: vi.fn().mockRejectedValue({ code: 10008 }),
    };
    const { publisher, id } = makePublisher(api, "m1");
    await publisher.publish(PAYLOAD);
    expect(api.create).toHaveBeenCalled();
    expect(id()).toBe("m2");
  });

  it("propagates non-unknown-message errors without touching the id", async () => {
    const api = { create: vi.fn(), edit: vi.fn().mockRejectedValue({ status: 500 }) };
    const { publisher, id } = makePublisher(api, "m1");
    await expect(publisher.publish(PAYLOAD)).rejects.toEqual({ status: 500 });
    expect(api.create).not.toHaveBeenCalled();
    expect(id()).toBe("m1");
  });

  it("close() delegates to the api teardown when present", async () => {
    const close = vi.fn();
    const { publisher } = makePublisher({ create: vi.fn(), edit: vi.fn(), close });
    await publisher.close();
    expect(close).toHaveBeenCalled();
  });
});

describe("isUnknownMessage", () => {
  it("matches Discord's UNKNOWN_MESSAGE code and plain 404s only", () => {
    expect(isUnknownMessage({ code: 10008 })).toBe(true);
    expect(isUnknownMessage({ status: 404 })).toBe(true);
    expect(isUnknownMessage({ status: 500 })).toBe(false);
    expect(isUnknownMessage(new Error("boom"))).toBe(false);
    expect(isUnknownMessage(null)).toBe(false);
  });
});
