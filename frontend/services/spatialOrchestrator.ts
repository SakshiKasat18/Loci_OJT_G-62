import * as Location from "expo-location";
import { getMotion } from "./imuTracker";
import { scanWifi } from "./wifiScanner";
import { eventBus } from "../core/EventBus";
import { ttsController } from "../core/TTSController";
import { ZONE_NEIGHBORS } from "../data/zones";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  private neighborAskIndex: number = 0;
  private visitedZones: Set<string> = new Set();
  private confidence: number = 0;

  private isScanning: boolean = false;
  private isAskingZone: boolean = false;   // concurrency guard for askNextZone()
  private lastWalkingTime: number = Date.now();
  private lastStableTime: number = Date.now();
  private departureDetected: boolean = false;
  // Tracks previous TTS state to detect speech-end → reset cooldown timer
  private wasSpeaking: boolean = false;

  // cancelId: incremented by every manual user action.
  // Async functions capture it at start and abort if it changes mid-flight.
  private cancelId: number = 0;

  /**
   * Stores the most recently spoken progression question text.
   * Used by repeatLastQuestion() to replay the question for the REPEAT voice intent.
   */
  private lastQuestion: string = "";

  private gpsAccuracy: number = 0;
  private wifiCount: number = 0;
  private avgRSSI: number = 0;

  /**
   * Set to true by transitionToEntrance().
   * Consumed on the first ENTRANCE_LOCKED loop tick — by which point
   * guide.tsx has mounted and SpeechEngine has subscribed to EventBus.
   * This prevents the entrance ZONE_CHANGED from firing before anyone is listening.
   */
  private pendingEntranceEmit: boolean = false;

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

  /** Start Experience / Resume Tour. */
  public async manualStart() {
    console.log("🚀 [SpatialOrchestrator] manualStart() — clean start");
    this.cancelId++;          // kill all pending async work
    await this.clearProgress(); // Always clear progress on manual start
    this.hardReset();
    this.transitionToEntrance();
  }

  private async saveProgress() {
    try {
      const data = {
        currentZone: this.currentZone,
        visitedZones: Array.from(this.visitedZones),
      };
      await AsyncStorage.setItem("loci_tour_progress", JSON.stringify(data));
    } catch (err) {
      console.warn("[SpatialOrchestrator] Failed to save progress:", err);
    }
  }

  public async clearProgress() {
    await AsyncStorage.removeItem("loci_tour_progress");
    this.visitedZones.clear();
    this.currentZone = null;
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
    
    console.log(`[SpatialOrchestrator] Skipped to: ${zoneId}`);
    
    // Check if skipping to this zone finishes the tour
    const isFinished = this.checkCompletion();
    if (!isFinished) {
      this.setState("WAITING_FOR_STOP"); // resets lastStableTime → 15s clock restarts
    }
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
    this.pendingEntranceEmit = false;
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

        // Breathing space: when TTS finishes, reset the 15s idle clock so the
        // orchestrator never fires a progression prompt immediately after narration.
        if (this.wasSpeaking && !isSpeaking) {
          this.lastStableTime = Date.now();
          console.log("[SpatialOrchestrator] TTS ended — 15s clock reset for breathing space.");
        }
        this.wasSpeaking = isSpeaking;

        // State machine
        switch (this.currentState) {
          case "OUTDOOR":
            break; // waiting for manualStart()

          case "ENTRANCE_LOCKED":
            // On the FIRST tick of ENTRANCE_LOCKED, emit the deferred entrance
            // ZONE_CHANGED. By now, guide.tsx has mounted and SpeechEngine has
            // subscribed — so the event is guaranteed to be received.
            // Skip the isSpeaking check on this same tick: SpeechEngine needs
            // one event loop cycle to receive the event and begin TTS.
            if (this.pendingEntranceEmit) {
              this.pendingEntranceEmit = false;
              console.log("[SpatialOrchestrator] Emitting deferred entrance ZONE_CHANGED.");
              eventBus.emit({ type: "ZONE_CHANGED", zoneId: "entrance", confidence: 0.8 });
              break; // hold — check isSpeaking on the NEXT loop tick (2s later)
            }
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
                this.neighborAskIndex = 0;
                this.askNeighbor();
              } else if (!this.departureDetected && !isSpeaking && now - this.lastStableTime > 15000) {
                // Guard: never fire a progression prompt while any TTS is playing.
                // wasSpeaking→!isSpeaking already reset lastStableTime above,
                // so this branch only fires after a genuine 15s silence window.
                console.log("[SpatialOrchestrator] 15s silence timeout — prompting next zone.");
                this.setState("ASKING_ZONE");
                this.neighborAskIndex = 0;
                this.askNeighbor();
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
   * Asks about a neighbor of the current zone.
   */
  private async askNeighbor() {
    if (this.isAskingZone) return;
    this.isAskingZone = true;
    const capturedCancel = this.cancelId;

    try {
      const remaining = TOUR_SEQUENCE.filter(z => !this.visitedZones.has(z));
      
      // If no zones left, don't ask about neighbors or anything else. Just finish.
      if (remaining.length === 0 && this.visitedZones.size > 0) {
        this.checkCompletion();
        return;
      }
      
      if (!this.currentZone) {
        // Start at entrance if nothing visited
        const startZone = "entrance";
        this.pendingZone = startZone;
        
        if (this.cancelId !== capturedCancel) return;
        this.lastQuestion = `Are you near the ${startZone.replace(/_/g, ' ')}?`;
        await ttsController.speak(this.lastQuestion);
        if (this.cancelId !== capturedCancel) return;
        eventBus.emit({ type: "ZONE_QUESTION_ASKED" });
        return;
      }

      // Special case: Only one destination left
      if (remaining.length === 1 && remaining[0] !== this.currentZone) {
        const lastZone = remaining[0];
        this.pendingZone = lastZone;
        
        if (this.cancelId !== capturedCancel) return;
        this.lastQuestion = `The last destination is the ${lastZone.replace(/_/g, ' ')}. Are you near it?`;
        await ttsController.speak(this.lastQuestion);
        if (this.cancelId !== capturedCancel) return;
        eventBus.emit({ type: "ZONE_QUESTION_ASKED" });
        return;
      }

      const neighbors = ZONE_NEIGHBORS[this.currentZone] || [];
      
      if (this.neighborAskIndex < neighbors.length) {
        const candidate = neighbors[this.neighborAskIndex];
        const displayName = candidate.replace(/_/g, ' ');
        this.pendingZone = candidate; 
        
        // Innovation Lab (Wormhole) specific delay
        if (candidate === 'innovation_lab') {
          await new Promise(r => setTimeout(r, 2000)); 
        }

        if (this.cancelId !== capturedCancel) return;
        this.lastQuestion = `Are you heading towards the ${displayName}?`;
        await ttsController.speak(this.lastQuestion);
        if (this.cancelId !== capturedCancel) return;
        eventBus.emit({ type: "ZONE_QUESTION_ASKED" });
      } else {
        // Exhausted neighbors
        if (this.neighborAskIndex === neighbors.length) {
          const displayName = this.currentZone.replace(/_/g, ' ');
          this.pendingZone = this.currentZone;
          
          if (this.cancelId !== capturedCancel) return;
          this.lastQuestion = `Are you still near the ${displayName}?`;
          await ttsController.speak(this.lastQuestion);
          if (this.cancelId !== capturedCancel) return;
          eventBus.emit({ type: "ZONE_QUESTION_ASKED" });
        } else {
          // Fallback
          if (this.cancelId !== capturedCancel) return;
          await ttsController.speak("It seems we're taking the scenic route.");
          if (this.cancelId !== capturedCancel) return;
          this.triggerNarration("polaris");
        }
      }
    } finally {
      if (this.cancelId === capturedCancel) {
        this.isAskingZone = false;
      }
    }
  }

  /** YES/NO response from UI buttons or voice intent. */
  public handleResponse(yes: boolean) {
    if (this.currentState !== "ASKING_ZONE") return;

    if (yes) {
      this.confidence = 1;
      this.currentZone = this.pendingZone;
      this.pendingZone = null;
      this.triggerNarration();
    } else {
      this.neighborAskIndex++;
      this.askNeighbor();
    }
  }

  /**
   * Replays the last spoken progression question via TTS.
   * Called when the user says "repeat" or "say that again".
   * Emits ZONE_QUESTION_ASKED afterwards so guide.tsx reopens the auto-listen window.
   */
  public async repeatLastQuestion(): Promise<void> {
    if (!this.lastQuestion || this.currentState !== "ASKING_ZONE") return;
    await ttsController.speak(this.lastQuestion);
    // Re-signal that a question has been asked — guide.tsx will re-open auto-listen
    eventBus.emit({ type: "ZONE_QUESTION_ASKED" });
  }

  // ─── Zone Transitions ────────────────────────────────────────────────────────

  private transitionToEntrance() {
    this.currentZone = "entrance";
    this.visitedZones.add("entrance");
    this.confidence = 0.8;
    this.setState("ENTRANCE_LOCKED");
    // Do NOT emit ZONE_CHANGED here — guide.tsx and SpeechEngine have not
    // mounted yet. Set the flag so the loop emits it on its next tick.
    this.pendingEntranceEmit = true;
    console.log("[SpatialOrchestrator] Entrance pending — ZONE_CHANGED will fire on next loop tick.");
  }

  private triggerNarration(zoneId?: string) {
    const target = zoneId ?? this.currentZone;
    if (!target) return;

    this.visitedZones.add(target);
    this.saveProgress(); // persistence
    this.setState("NARRATING");
    eventBus.emit({ type: "ZONE_CHANGED", zoneId: target, confidence: 1 });

    this.checkCompletion();
  }

  /** Checks if all zones are visited and handles transition to TOUR_FINISHED. */
  private checkCompletion(): boolean {
    const remaining = TOUR_SEQUENCE.filter((z) => !this.visitedZones.has(z));
    if (remaining.length === 0 && this.visitedZones.size > 0) {
      const captured = this.cancelId;
      setTimeout(async () => {
        if (this.cancelId !== captured) return; 
        console.log("🎉 [SpatialOrchestrator] Tour complete!");
        this.setState("TOUR_FINISHED");
        eventBus.emit({ type: "TOUR_FINISHED" });
      }, 500);
      return true;
    }
    return false;
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
