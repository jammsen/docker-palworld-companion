import type { CompanionConfig } from "../config.js";
import { log } from "../logger.js";
import type { MetricsCollector } from "../metrics/collector.js";
import type { StateStore } from "../state.js";
import { buildStatusCard, type CardState } from "./card.js";
import { describeDiscordError } from "./errors.js";
import type { EventRelay } from "./event-relay.js";
import type { PresenceUpdater } from "./presence.js";
import type { StatusTransport } from "./transport.js";
import { createWebhookTransport } from "./webhook.js";

export interface DiscordStatusDeps {
  collector: MetricsCollector;
  state: StateStore;
  /** Required in bot mode (wired in index.ts with the shared REST manager) */
  transport?: StatusTransport;
  /** Bot mode: gateway presence, updated after each card publish */
  presence?: PresenceUpdater;
  /** Bot mode: logs-channel event stream, fed after each card publish */
  eventRelay?: EventRelay;
  /** Bot mode: admin-channel audit stream (admin-action events with actor) */
  auditRelay?: EventRelay;
  /** Bot mode: effective interval getter - the panel can hot-change it; the timer re-arms after the next tick */
  runtimeInterval?: () => number;
  /** Bot mode: effective event emojis (/setup-icons tokens merged over env) - hot-applied per tick */
  eventEmoji?: () => Partial<Record<string, string>>;
}

// Interval loop: collect a snapshot, render the card, publish (create-or-edit),
// then feed the optional event relay and presence. Returns a stop function
// that publishes a final "offline" card and closes the transport.
export async function startDiscordStatus(
  config: CompanionConfig,
  deps: DiscordStatusDeps,
): Promise<() => Promise<void>> {
  const discord = config.discord;
  if (!discord) throw new Error("startDiscordStatus called without Discord config");

  const { collector, state } = deps;
  let transport: StatusTransport;
  if (deps.transport) {
    transport = deps.transport;
  } else if (discord.mode === "webhook") {
    transport = createWebhookTransport({
      webhookUrl: discord.webhookUrl,
      getMessageId: () => state.get().discordMessageId,
      setMessageId: (id) => state.update({ discordMessageId: id }),
    });
  } else {
    throw new Error("bot mode requires an injected transport (wired in index.ts)");
  }

  let inFlight = false;
  let stopped = false;
  let currentTick: Promise<void> = Promise.resolve();

  const tick = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const snapshot = await collector.collect();
      const cardState: CardState = snapshot.serverUp ? "online" : "starting";
      const serverName = snapshot.serverName;
      // Independent streams: a failing card channel must not silence the
      // relays (different channels) or the presence, and vice versa
      try {
        await transport.publish(
          buildStatusCard(snapshot, cardState, serverName, {
            platformEmoji: discord.platformEmoji,
            eventEmoji: deps.eventEmoji?.() ?? discord.eventEmoji,
            eventAmount: discord.eventAmount,
          }),
        );
      } catch (error) {
        log.warn(`>>> Discord status update failed: ${describeDiscordError(error)}`);
      }
      try {
        await deps.eventRelay?.publish(snapshot.events);
        await deps.auditRelay?.publish(snapshot.events);
      } catch (error) {
        log.warn(`>>> Discord event relay failed: ${describeDiscordError(error)}`);
      }
      deps.presence?.publish(snapshot, cardState);
    } catch (error) {
      // Snapshot collection itself failed - nothing could be published
      log.warn(`>>> Discord status update failed: ${describeDiscordError(error)}`);
    } finally {
      // Interval changes apply even while Discord or the game API is down
      rearmTimer();
      inFlight = false;
    }
  };

  // Capture the promise only when a tick actually starts, so stop() awaits
  // the real in-flight publish and not an instantly-resolved guard return.
  const scheduleTick = () => {
    if (!inFlight && !stopped) currentTick = tick();
  };

  // Defensive floor: runtime getters already clamp to the mode minimums, this
  // only guards against a zero/negative value ever reaching setInterval
  const effectiveInterval = () => Math.max(5, deps.runtimeInterval?.() ?? discord.updateIntervalSeconds);
  let intervalSeconds = effectiveInterval();
  log.info(`>>> Discord status card enabled (${discord.mode} mode, update interval: ${intervalSeconds}s)`);
  let timer: ReturnType<typeof setInterval> | undefined;
  const rearmTimer = () => {
    const next = effectiveInterval();
    if (next === intervalSeconds || stopped) return;
    intervalSeconds = next;
    if (timer !== undefined) clearInterval(timer);
    timer = setInterval(scheduleTick, next * 1000);
    log.info(`>>> Discord update interval changed to ${next}s`);
  };
  scheduleTick();
  timer = setInterval(scheduleTick, intervalSeconds * 1000);

  return async () => {
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    await currentTick; // never rejects - tick() catches internally
    try {
      // Pick up the shell's 'stopping' event written just before our SIGTERM,
      // so the final card shows the complete log including the shutdown itself
      const snapshot = await collector.refreshEventsOnly();
      await transport.publish(
        buildStatusCard(snapshot, "offline", snapshot?.serverName ?? config.serverName, {
          platformEmoji: discord.platformEmoji,
          eventEmoji: deps.eventEmoji?.() ?? discord.eventEmoji,
          eventAmount: discord.eventAmount,
        }),
      );
      deps.presence?.publish(snapshot, "offline");
      log.info(">>> Discord status card set to offline");
    } catch (error) {
      log.warn(`>>> Final Discord offline update failed: ${String(error)}`);
    } finally {
      // Transport-owned teardown AFTER the final publish (gateway teardown is
      // composed separately in index.ts, after this stop function completes)
      try {
        await transport.close?.();
      } catch (error) {
        log.debug(`transport close failed: ${String(error)}`);
      }
    }
  };
}
