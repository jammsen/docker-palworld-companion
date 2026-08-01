// Translate the Discord API errors a misconfigured setup runs into most often
// into an actionable hint - the raw "Missing Access" alone sends users hunting
// (same duck-typing as isUnknownMessage: DiscordAPIError.code / REST status).
export function describeDiscordError(error: unknown): string {
  const base = String(error);
  if (typeof error !== "object" || error === null) return base;
  const candidate = error as { code?: unknown; status?: unknown };
  if (candidate.code === 50001) {
    return `${base} - the bot cannot see the configured channel. Open the channel's settings (Edit Channel -> Permissions), add the bot and allow View Channel, Send Messages and Embed Links. Permissions granted on a category only apply while the channel is synced with it (Permissions -> Sync Now)`;
  }
  if (candidate.code === 50013) {
    return `${base} - the bot can see the channel but lacks permissions there. In the channel's settings (Edit Channel -> Permissions) allow the bot Send Messages and Embed Links. Permissions granted on a category only apply while the channel is synced with it (Permissions -> Sync Now)`;
  }
  if (candidate.code === 10003) {
    return `${base} - the configured channel id does not exist (or the bot is not on that server). Re-copy it with right-click -> Copy Channel ID`;
  }
  if (candidate.status === 401) {
    return `${base} - DISCORD_BOT_TOKEN was rejected. Reset the token on the application's Bot page and update your default.env`;
  }
  return base;
}
