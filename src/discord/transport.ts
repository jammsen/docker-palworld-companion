export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  timestamp?: string;
  footer?: { text: string };
}

export interface EmbedPayload {
  embeds: DiscordEmbed[];
}

// Transport seam with two implementations: webhook (WebhookClient, no bot
// account) and bot (bot-token REST channel messages). Implementations own
// create-or-edit semantics so callers just publish.
export interface StatusTransport {
  publish(payload: EmbedPayload): Promise<void>;
  /** Optional teardown for transport-owned resources; called after the final offline publish */
  close?(): Promise<void>;
}
