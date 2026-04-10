/**
 * EventBus — Central pub-sub system for LOCI spatial events.
 *
 * All zone triggers (sensor, simulated, or real) must go through here.
 * No component should communicate spatially without emitting an event.
 *
 * To replace the input layer in production:
 *   - Leave this file fully unchanged
 *   - Replace DemoInput.ts with a real WiFi+IMU emitter
 *   - That emitter calls eventBus.emit(event) — nothing else changes
 */

// ─────────────────────────────────────────────────────────────────────────────
// Event Contract — DO NOT change this type once in production.
// This is the sealed interface between the input layer and the speech engine.
// ─────────────────────────────────────────────────────────────────────────────

export type LociEvent = {
  type: "ZONE_CHANGED";
  zoneId: string;
  confidence: number; // 0.0 → 1.0
};

export type EventHandler = (event: LociEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// EventBus Class
// ─────────────────────────────────────────────────────────────────────────────

class EventBus {
  private handlers: EventHandler[] = [];

  /**
   * Subscribe a handler to receive all events.
   * Returns an unsubscribe function — call it on cleanup (e.g., useEffect return).
   */
  subscribe(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Emit an event to all current subscribers.
   * Events are delivered synchronously in subscription order.
   */
  emit(event: LociEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        // Isolate handler failures — one bad subscriber must not block others
        console.error("[EventBus] Handler threw an error:", err);
      }
    }
  }

  /** Debug helper — returns current subscriber count */
  get listenerCount(): number {
    return this.handlers.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export — one bus for the entire app lifetime
// ─────────────────────────────────────────────────────────────────────────────

export const eventBus = new EventBus();
