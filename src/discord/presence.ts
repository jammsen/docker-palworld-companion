import { log } from "../logger.js";
import type { StatusSnapshot } from "../metrics/collector.js";
import type { CardState } from "./card.js";

export interface Activity {
  text: string;
  status: "online" | "idle" | "dnd" | "invisible";
}

// Pure mapping from server state to the bot member's presence
export function formatActivity(snapshot: StatusSnapshot | null, cardState: CardState): Activity {
  if (cardState === "offline") return { text: "Server offline", status: "dnd" };
  const game = snapshot?.game;
  if (cardState === "starting" || !game) return { text: "Server starting…", status: "idle" };
  return { text: `${game.currentplayernum}/${game.maxplayernum} players · Day ${game.days}`, status: "online" };
}

export interface PresenceTarget {
  setActivity(activity: Activity): void;
}

// Pushes presence only when the text actually changed - keeps us far below
// the gateway presence rate limit and avoids useless websocket chatter
export class PresenceUpdater {
  private lastText: string | undefined;

  constructor(
    private readonly target: PresenceTarget,
    /** Hot-toggle from the panel; disabling flips the member invisible once */
    private readonly enabled: () => boolean = () => true,
  ) {}

  publish(snapshot: StatusSnapshot | null, cardState: CardState): void {
    if (!this.enabled()) {
      if (this.lastText !== undefined) {
        this.lastText = undefined;
        this.push({ text: "", status: "invisible" });
      }
      return;
    }
    const activity = formatActivity(snapshot, cardState);
    if (activity.text === this.lastText) return;
    this.lastText = activity.text;
    this.push(activity);
  }

  private push(activity: Activity): void {
    try {
      this.target.setActivity(activity);
    } catch (error) {
      log.debug(`presence update failed: ${String(error)}`);
    }
  }
}
