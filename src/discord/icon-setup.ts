import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Routes } from "discord.js";
import { ALL_EVENT_TYPES } from "../events.js";
import { log } from "../logger.js";
import type { RestLike } from "./bot-transport.js";

// /setup-icons uploads a shipped icon set as APPLICATION emojis: owned by the
// bot app (2000 slots), consuming no guild emoji slots and usable in every
// message the bot itself sends - exactly where the card, logs and audit lines
// come from. Names are style-agnostic (pw_<event>) so re-running with another
// style replaces the images without touching anything else.

/** The RestLike surface plus the app-emoji routes (list/create/delete) */
export interface EmojiRestLike extends RestLike {
  get(route: `/${string}`): Promise<unknown>;
  delete(route: `/${string}`): Promise<unknown>;
}

export interface IconSetupOptions {
  rest: EmojiRestLike;
  applicationId: string;
  iconsDir: string;
  style: string;
}

export const EMOJI_NAME_PREFIX = "pw_";

export function emojiNameFor(eventType: string): string {
  return `${EMOJI_NAME_PREFIX}${eventType.replaceAll("-", "_")}`;
}

/** Icon sets shipped in the image - one directory per set */
export async function listIconSets(iconsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(iconsDir, { withFileTypes: true });
    const sets: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await stat(join(iconsDir, entry.name, "join.png"));
        sets.push(entry.name);
      } catch {
        // Not an icon set - ignore
      }
    }
    return sets.sort();
  } catch {
    return [];
  }
}

interface ApplicationEmoji {
  id: string;
  name: string;
}

/**
 * Upload every event icon of the chosen style, replacing companion-managed
 * app emojis (pw_*) from earlier runs. Returns the `<:name:id>` token per
 * event type, ready for the card and the relays.
 */
export async function uploadIconSet(options: IconSetupOptions): Promise<Record<string, string>> {
  const { rest, applicationId, iconsDir, style } = options;
  const setDir = join(iconsDir, style);

  const listed = (await rest.get(Routes.applicationEmojis(applicationId))) as { items?: ApplicationEmoji[] };
  const existing = new Map((listed.items ?? []).map((emoji) => [emoji.name, emoji.id]));

  const tokens: Record<string, string> = {};
  for (const eventType of ALL_EVENT_TYPES) {
    const name = emojiNameFor(eventType);
    const image = await readFile(join(setDir, `${eventType}.png`));
    const previous = existing.get(name);
    if (previous !== undefined) {
      await rest.delete(Routes.applicationEmoji(applicationId, previous));
    }
    const created = (await rest.post(Routes.applicationEmojis(applicationId), {
      body: { name, image: `data:image/png;base64,${image.toString("base64")}` },
    })) as ApplicationEmoji;
    tokens[eventType] = `<:${created.name}:${created.id}>`;
  }
  log.info(`>>> Uploaded icon set '${style}' as ${ALL_EVENT_TYPES.length} application emojis`);
  return tokens;
}
