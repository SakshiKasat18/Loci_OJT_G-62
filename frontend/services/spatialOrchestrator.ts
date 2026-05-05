import * as Location from "expo-location";
import { getMotion } from "./imuTracker";
import { scanWifi } from "./wifiScanner";
import { eventBus } from "../core/EventBus";
import { ttsController } from "../core/TTSController";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrchestratorState =
  | "OUTDOOR"
  | "ENTRANCE_LOCKED"
  | "WAITING_FOR_STOP"
  | "ASKING_ZONE"
  | "NARRATING"
  | "TOUR_FINISHED";

export const TOUR_SEQUENCE = [
  "entrance",
  "reception",
  "radial_classroom",
  "admin_block",
  "cafeteria",
  "gaming_arcade",
  "innovation_lab",
] as const;

// ─── Orchestrator ─────────────────────────────────────────────────────────────

class SpatialOrchestrator {
  private currentState: OrchestratorState = "OUTDOOR";
  private currentZone: string | null = null;
  private pendingZone: string | null = null;
  private visitedZones: Set<string> = new Set();
  private confidence: number = 0;

  private isScanning: boolean = false;
  private isAskingZone: boolean = false;   // concurrency guard for askNextZone()
  private lastWalkingTime: number = Date.now();
  private lastStableTime: number = Date.now();
  private departureDetected: boolean = false;

  // cancelId: incremented by every manual user action.
  // Async functions capture it at start and abort if it changes mid-flight.
  private cancelId: number = 0;

  private gpsAccuracy: number = 0;
  private wifiCount: number = 0;
  private avgRSSI: number = 0;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log("🚀 [SpatialOrchestrator] Starting loop...");
    this.runLoop();
  }

  stop() {
    this.isScanning = false;
    console.log("🛑 [SpatialOrchestrator] Stopped");
  }

  // ─── Public Manual Controls ─────────────────────────────────────────────────

  /** Start Experience / Restart Tour — always clean from entrance. */
  public manualStart() {
    console.log("🚀 [SpatialOrchestrator] manualStart() — clean start");
    this.cancelId++;          // kill all pending async work
    this.hardReset();
    this.transitionToEntrance();
  }

  /**
   * Called by Skip in guide.tsx.
   * Syncs orchestrator to the zone the UI just skipped to,
   * cancels any pending zone prompts, resets the 15s timer.
   */
  public skipToZone(zoneId: string) {
    this.cancelId++;
    this.isAskingZone = false;
    this.currentZone = zoneId;
    this.visitedZones.add(zoneId);
    this.pendingZone = null;
    this.departureDetected = false;
    this.setState("WAITING_FOR_STOP"); // resets lastStableTime → 15s clock restarts
    console.log(`[SpatialOrchestrator] Skipped to: ${zoneId}`);
  }

  /**
   * Called by Stop / Replay in guide.tsx.
   * Cancels all pending async work and silences the orchestrator.
   * Loop continues running but OUTDOOR state does nothing.
   */
  public cancelAll() {
    this.cancelId++;
    this.isAskingZone = false;
    this.pendingZone = null;
    this.departureDetected = false;
    this.currentState = "OUTDOOR"; // direct assign — no setState() log noise
    console.log("[SpatialOrchestrator] cancelAll() — system idle");
  }

  // ─── Internal Reset ─────────────────────────────────────────────────────────

  private hardReset() {
    this.visitedZones.clear();
    this.currentZone = null;
    this.pendingZone = null;
    this.isAskingZone = false;
    this.currentState = "OUTDOOR";
    this.departureDetected = false;
    this.confidence = 0;
  }

  // ─── Sensor Loop ────────────────────────────────────────────────────────────

  private async runLoop() {
    while (this.isScanning) {
      try {
        // GPS
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          this.gpsAccuracy = loc.coords.accuracy ?? 100;
        } catch {
          this.gpsAccuracy = 100;
        }

        // WiFi (safe — returns [] in Expo Go)
        try {
          const wifi = await scanWifi();
          this.wifiCount = wifi.length;
          this.avgRSSI =
            this.wifiCount > 0
              ? wifi.reduce((s: number, a: any) => s + a.level, 0) / this.wifiCount
              : -100;
        } catch {
          this.wifiCount = 0;
          this.avgRSSI = -100;
        }

        // Motion
        const { isMoving } = getMotion();
        if (isMoving) this.lastWalkingTime = Date.now();

        const now = Date.now();
        const isSpeaking = await ttsController.isSpeaking();

        // State machine
        switch (this.currentState) {
          case "OUTDOOR":
            break; // waiting for manualStart()

          case "ENTRANCE_LOCKED":
            if (!isSpeaking) this.setState("WAITING_FOR_STOP");
            break;

          case "WAITING_FOR_STOP":
            if (isMoving) {
              if (!this.departureDetected) {
                this.departureDetected = true;
                console.log("[SpatialOrchestrator] Departure detected.");
              }
            } else {
              if (this.departureDetected && now - this.lastWalkingTime > 3000) {
                this.departureDetected = false;
                this.setState("ASKING_ZONE");
                this.askNextZone();
              } else if (!this.departureDetected && now - this.lastStableTime > 15000) {
                console.log("[SpatialOrchestrator] 15s timeout — prompting next zone.");
                this.setState("ASKING_ZONE");
                this.askNextZone();
              }
            }
            break;

          case "NARRATING":
            if (!isSpeaking) this.setState("WAITING_FOR_STOP");
            break;

          case "ASKING_ZONE":
            break; // waiting for handleResponse()

          case "TOUR_FINISHED":
            break; // terminal — only manualStart() exits
        }
      } catch (err) {
        console.error("[SpatialOrchestrator] Loop error:", err);
        // Safety net: if loop errors in a non-terminal state, reset to OUTDOOR
        if (this.currentState !== "TOUR_FINISHED") {
          this.currentState = "OUTDOOR";
        }
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ─── Zone Navigation (Linear, No Graph) ─────────────────────────────────────

  /**
   * Asks about the next unvisited zone in TOUR_SEQUENCE order.
   * Captured cancelId prevents stale calls from completing after Skip/Stop.
   */
  private async askNextZone() {
    if (this.isAskingZone) return;
    this.isAskingZone = true;
    const capturedCancel = this.cancelId;

    try {
      const nextZone = TOUR_SEQUENCE.find((z) => !this.visitedZones.has(z));

      if (!nextZone) {
        // All zones visited
        if (this.cancelId !== capturedCancel) return;
        this.setState("TOUR_FINISHED");
        eventBus.emit({ type: "TOUR_FINISHED" });
        return;
      }

      this.pendingZone = nextZone;
      const name = nextZone.replace(/_/g, " ");
      await ttsController.speak(`Are you near the ${name}?`);

      // Abort if cancelled during speak
      if (this.cancelId !== capturedCancel) return;

    } finally {
      // Only release guard if we're still the active call
      if (this.cancelId === capturedCancel) {
        this.isAskingZone = false;
      }
    }
  }

  /** YES/NO response from UI buttons. */
  public handleResponse(yes: boolean) {
    if (this.currentState !== "ASKING_ZONE") return;

    if (yes) {
      this.confidence = 1;
      this.currentZone = this.pendingZone;
      this.pendingZone = null;
      this.triggerNarration();
    } else {
      // User is NOT at pendingZone — mark it visited to skip it in sequence
      if (this.pendingZone) {
        this.visitedZones.add(this.pendingZone);
        this.pendingZone = null;
      }
      // Backdate lastStableTime so the NEXT loop cycle (2s) fires immediately
      // This avoids a 15s awkward silence after NO
      this.setState("WAITING_FOR_STOP");
      this.lastStableTime = Date.now() - 16000; // instant re-trigger
    }
  }

  // ─── Zone Transitions ────────────────────────────────────────────────────────

  private transitionToEntrance() {
    this.currentZone = "entrance";
    this.visitedZones.add("entrance");
    this.confidence = 0.8;
    this.setState("ENTRANCE_LOCKED");
    eventBus.emit({ type: "ZONE_CHANGED", zoneId: "entrance", confidence: 0.8 });
  }

  private triggerNarration(zoneId?: string) {
    const target = zoneId ?? this.currentZone;
    if (!target) return;

    this.visitedZones.add(target);
    this.setState("NARRATING");
    eventBus.emit({ type: "ZONE_CHANGED", zoneId: target, confidence: 1 });

    // Tour complete check — cancelId-guarded so restart can't be poisoned
    const remaining = TOUR_SEQUENCE.filter((z) => !this.visitedZones.has(z));
    if (remaining.length === 0) {
      const captured = this.cancelId;
      setTimeout(() => {
        if (this.cancelId !== captured) return; // user restarted — abort
        console.log("🎉 [SpatialOrchestrator] Tour complete!");
        this.setState("TOUR_FINISHED");
        eventBus.emit({ type: "TOUR_FINISHED" });
      }, 500);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private setState(state: OrchestratorState) {
    if (this.currentState === state) return;
    console.log(`[SpatialOrchestrator] ${this.currentState} → ${state}`);
    this.currentState = state;
    this.lastStableTime = Date.now();
  }

  public getData() {
    return {
      currentState: this.currentState,
      currentZone: this.currentZone,
      confidence: this.confidence,
      gpsAccuracy: this.gpsAccuracy,
      wifiCount: this.wifiCount,
      avgRSSI: this.avgRSSI,
      isWalking: getMotion().isMoving,
      lastStableTime: this.lastStableTime,
      visitedZones: Array.from(this.visitedZones),
    };
  }
}

export const spatialOrchestrator = new SpatialOrchestrator();
