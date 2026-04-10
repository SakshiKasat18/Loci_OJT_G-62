/**
 * SpeechEngine — The core decision controller for LOCI's audio guidance system.
 *
 * This is the most critical module in the speech pipeline.
 * It sits between the EventBus (input) and TTSController (output).
 *
 * Design philosophy:
 *   Deterministic > intelligent
 *   Silence > incorrect output
 *   Stability > accuracy
 *
 * All gating logic lives HERE and only here.
 * - UI does not make speech decisions
 * - Input layer does not make speech decisions
 * - TTSController does not make speech decisions
 *
 * SpeechEngine subscribes to EventBus during init() and unsubscribes on destroy().
 * It is designed to be initialized once at app startup and live for the session.
 */

import { eventBus, type LociEvent } from "./EventBus";
import { ttsController } from "./TTSController";
import { getZoneScript } from "./ZoneScriptMapper";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — Tune these values without touching logic
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  /** Minimum confidence required to trigger speech. Range: 0.0 → 1.0 */
  CONFIDENCE_THRESHOLD: 0.7,

  /**
   * Minimum milliseconds that must pass after the LAST SPEECH STARTED
   * before a new zone trigger is accepted.
   * This prevents rapid re-triggering when a user lingers at a zone boundary.
   */
  COOLDOWN_MS: 8000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SpeechEngine Class
// ─────────────────────────────────────────────────────────────────────────────

class SpeechEngine {
  // ── Internal State ──────────────────────────────────────────────────────────

  /** True while TTS is actively playing audio */
  private isSpeaking: boolean = false;

  /**
   * Timestamp (ms) of the last time speech was STARTED.
   * Used for cooldown gating.
   * 0 means no speech has ever been triggered this session.
   */
  private lastSpokenAt: number = 0;

  /**
   * The zoneId of the most recently narrated zone.
   * Used to prevent re-narrating the same zone.
   * null means no zone has been spoken this session.
   */
  private currentZone: string | null = null;

  /** Unsubscribe function returned by EventBus.subscribe() */
  private unsubscribe: (() => void) | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Initialize the engine and subscribe to the EventBus.
   * Call once at app startup (e.g., in a top-level useEffect with empty deps).
   *
   * Safe to call multiple times — duplicate subscriptions are prevented.
   */
  init(): void {
    if (this.unsubscribe) {
      console.warn("[SpeechEngine] init() called while already initialized. Ignoring.");
      return;
    }
    this.unsubscribe = eventBus.subscribe((event) => this.handle(event));
    console.log("[SpeechEngine] Initialized and subscribed to EventBus.");
  }

  /**
   * Shut down the engine: unsubscribe from EventBus and stop any ongoing speech.
   * Call on app exit or when the guide screen unmounts.
   */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    ttsController.stop();
    this.isSpeaking = false;
    console.log("[SpeechEngine] Destroyed and unsubscribed.");
  }

  // ── Core Handler ─────────────────────────────────────────────────────────────

  /**
   * Handle an incoming event from the EventBus.
   *
   * This is the gating pipeline. Events are silently dropped at each gate
   * unless all conditions pass. The ordering is intentional:
   *   1. Confidence gate (data quality)
   *   2. Duplicate gate (same zone, no value in re-narrating)
   *   3. Busy gate (audio is already playing — no overlap)
   *   4. Cooldown gate (too soon after last narration)
   *   5. Content gate (no script available — stay silent)
   *   → Speak
   */
  private handle(event: LociEvent): void {
    const { zoneId, confidence, type } = event;

    if (type !== "ZONE_CHANGED") return; // Only handle zone change events

    // ── Gate 1: Confidence ──────────────────────────────────────────────────
    if (confidence < CONFIG.CONFIDENCE_THRESHOLD) {
      console.log(
        `[SpeechEngine] ⛔ Dropped — low confidence: ${confidence} (min: ${CONFIG.CONFIDENCE_THRESHOLD})`
      );
      return;
    }

    // ── Gate 2: Duplicate Zone ──────────────────────────────────────────────
    if (zoneId === this.currentZone) {
      console.log(`[SpeechEngine] ⛔ Dropped — already in zone: ${zoneId}`);
      return;
    }

    // ── Gate 3: Already Speaking ────────────────────────────────────────────
    if (this.isSpeaking) {
      console.log(`[SpeechEngine] ⛔ Dropped — TTS busy (zone: ${zoneId})`);
      return;
    }

    // ── Gate 4: Cooldown ────────────────────────────────────────────────────
    const elapsed = Date.now() - this.lastSpokenAt;
    if (this.lastSpokenAt > 0 && elapsed < CONFIG.COOLDOWN_MS) {
      const remaining = CONFIG.COOLDOWN_MS - elapsed;
      console.log(
        `[SpeechEngine] ⛔ Dropped — cooldown active (${remaining}ms remaining)`
      );
      return;
    }

    // ── Gate 5: Script Lookup ───────────────────────────────────────────────
    const script = getZoneScript(zoneId);
    if (!script) {
      console.log(`[SpeechEngine] ⛔ Dropped — no script for zone: ${zoneId}`);
      return;
    }

    // ── All Gates Passed → Speak ────────────────────────────────────────────
    console.log(`[SpeechEngine] ✅ Speaking zone: ${zoneId}`);
    this.speak(zoneId, script);
  }

  /**
   * Execute speech for a zone.
   * Sets isSpeaking to true, delegates to TTSController, resets state on completion.
   */
  private async speak(zoneId: string, script: string): Promise<void> {
    this.isSpeaking = true;
    this.lastSpokenAt = Date.now();

    try {
      await ttsController.speak(script);
    } finally {
      // Always release the speaking lock — even if TTS errored
      this.isSpeaking = false;
      this.currentZone = zoneId;
      console.log(`[SpeechEngine] ✅ Completed: ${zoneId}`);
    }
  }

  // ── State Accessors (read-only, for UI display) ───────────────────────────

  /** Expose whether TTS is currently playing. UI can use this for status display. */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Expose current zone ID. UI can use this to highlight the active zone. */
  get activeZone(): string | null {
    return this.currentZone;
  }

  /**
   * Forcibly reset engine state. Useful for demo "restart" scenarios.
   * Does NOT stop in-progress speech — call ttsController.stop() first.
   */
  reset(): void {
    this.isSpeaking = false;
    this.lastSpokenAt = 0;
    this.currentZone = null;
    console.log("[SpeechEngine] State reset.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export — one engine for the entire app session
// ─────────────────────────────────────────────────────────────────────────────

export const speechEngine = new SpeechEngine();
