/**
 * DemoInput — Simulated input layer for the LOCI speech pipeline.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️  THIS IS THE ONLY FILE THAT CHANGES WHEN MOVING TO PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * In production, replace this file with a WiFi + IMU sensor fusion emitter.
 * That module will read signals and call:
 *
 *   eventBus.emit({ type: "ZONE_CHANGED", zoneId: detectedZone, confidence: score });
 *
 * Everything else (EventBus, SpeechEngine, TTSController, ZoneScriptMapper)
 * remains COMPLETELY unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL RULE — This file contains ZERO logic.
 * ─────────────────────────────────────────────────────────────────────────
 * It only emits events. No gating, no decisions, no state management.
 * All of that belongs in SpeechEngine.
 */

import { eventBus } from "./EventBus";
import { getDemoZoneIds } from "./ZoneScriptMapper";

// ─────────────────────────────────────────────────────────────────────────────
// Demo Zone Sequence — LOCKED for the APK demo
// Order simulates a visitor walking through the Polaris ground floor.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_ZONES = [
  "reception",
  "merchandise_display",
  "radial_classroom",
  "creator_zone",
  "cafeteria",
  "wormhole",
] as const;

export type DemoZoneId = (typeof DEMO_ZONES)[number];

// Confidence used for all simulated events.
// Must be above SpeechEngine's threshold (0.7) to trigger speech.
const SIMULATED_CONFIDENCE = 0.9;

// ─────────────────────────────────────────────────────────────────────────────
// triggerZone — Emit a single ZONE_CHANGED event
//
// This is the production-compatible interface.
// In the future, replace the call to this with real sensor output.
// ─────────────────────────────────────────────────────────────────────────────

export function triggerZone(zoneId: string): void {
  eventBus.emit({
    type: "ZONE_CHANGED",
    zoneId,
    confidence: SIMULATED_CONFIDENCE,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// triggerSequence — Auto-walk through all demo zones with a delay between each
//
// Used by the "Auto Tour" button in the guide screen.
// delayMs: milliseconds between each zone trigger.
//          Should be longer than average narration duration + cooldown.
//          Recommended: 12000ms (12s) for natural pacing.
//
// Returns a cancel function — call it to stop the sequence mid-way.
// ─────────────────────────────────────────────────────────────────────────────

export function triggerSequence(delayMs: number): () => void {
  let cancelled = false;
  const zones = getDemoZoneIds(); // respects ZoneScriptMapper's current config

  async function runSequence() {
    for (let i = 0; i < zones.length; i++) {
      if (cancelled) break;
      triggerZone(zones[i]);
      if (i < zones.length - 1) {
        await wait(delayMs);
      }
    }
  }

  runSequence();

  return () => {
    cancelled = true;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
