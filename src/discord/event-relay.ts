import { Routes } from "discord.js";
import { eventKey, type ServerEvent } from "../events.js";
import { log } from "../logger.js";
import type { RestLike } from "./bot-transport.js";
import { renderEventLine } from "./card.js";
import { describeDiscordError } from "./errors.js";

// Safety cap per tick - events are rare (15s detection cadence), a burst
// beyond this indicates something unusual, the remainder follows next tick
const MAX_POSTS_PER_TICK = 10;

export interface EventRelayOptions {
  rest: RestLike;
  /** Getter: undefined disables the relay (the panel can hot-toggle the channel) */
  channelId: () => string | undefined;
  /** Static map, or a getter so /setup-icons tokens hot-apply */
  eventEmoji: Partial<Record<string, string>> | (() => Partial<Record<string, string>>);
  getCursor: () => string | undefined;
  setCursor: (key: string) => Promise<void>;
  /** Which events this relay posts (default: all). The cursor advances past filtered events too. */
  filter?: (event: ServerEvent) => boolean;
  /** Line renderer (default: the card's event line) */
  render?: (event: ServerEvent, eventEmoji: Partial<Record<string, string>>) => string;
}

// Posts events from the merged game+companion stream as one message each.
// Used twice: as the logs-channel relay (all events) and as the admin-channel
// audit relay (admin-action events, rendered with the acting user). A cursor
// in state.json prevents re-posting across restarts.
export class EventRelay {
  constructor(private readonly options: EventRelayOptions) {}

  /** events = the snapshot's merged, chronological event list */
  async publish(events: ServerEvent[]): Promise<void> {
    const channelId = this.options.channelId();
    if (channelId === undefined) return; // disabled - cursor untouched, backlog capped on re-enable
    const newest = events.at(-1);
    const cursor = this.options.getCursor();

    // First activation: anchor at the newest existing event - no history flood
    if (cursor === undefined) {
      await this.options.setCursor(newest ? eventKey(newest) : "");
      return;
    }

    let fresh: ServerEvent[];
    if (cursor === "") {
      fresh = events;
    } else {
      const cursorIndex = events.findIndex((event) => eventKey(event) === cursor);
      if (cursorIndex >= 0) {
        fresh = events.slice(cursorIndex + 1);
      } else if (newest) {
        // Cursor rotated out of the capped window (long downtime) - re-anchor
        // at the newest event instead of flooding the channel with history
        log.debug("event-relay cursor not found in the current window - re-anchoring without posting");
        await this.options.setCursor(eventKey(newest));
        return;
      } else {
        return;
      }
    }

    const render = this.options.render ?? renderEventLine;
    let posts = 0;
    for (const event of fresh) {
      if (posts >= MAX_POSTS_PER_TICK) break;
      if (this.options.filter?.(event) ?? true) {
        try {
          await this.options.rest.post(Routes.channelMessages(channelId), {
            body: {
              content: render(
                event,
                typeof this.options.eventEmoji === "function" ? this.options.eventEmoji() : this.options.eventEmoji,
              ),
            },
          });
        } catch (error) {
          // Do not advance the cursor past a failed post - retried next tick
          log.warn(`>>> Discord event relay post failed - retrying next update: ${describeDiscordError(error)}`);
          return;
        }
        posts += 1;
      }
      await this.options.setCursor(eventKey(event));
    }
  }
}
