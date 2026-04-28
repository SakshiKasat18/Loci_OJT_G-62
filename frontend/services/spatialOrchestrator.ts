import * as Location from "expo-location";
import { getMotion } from "./imuTracker";
import { scanWifi } from "./wifiScanner";
import { eventBus } from "../core/EventBus";
import { ttsController } from "../core/TTSController";

export type OrchestratorState =
  | "OUTDOOR"
  | "INDOOR_DETECTED"
  | "ENTRANCE_LOCKED"
  | "WAITING_FOR_STOP"
  | "ASKING_ZONE"
  | "ZONE_CONFIRMED"
  | "NARRATING";

const TOUR_SEQUENCE = [
  "entrance",
  "reception",
  "merchandise_display",
  "radial_classroom",
  "admin_block",
  "creator_zone",
  "cafeteria",
  "gaming_room",
  "innovation_lab",
];

class SpatialOrchestrator {
  private currentState: OrchestratorState = "OUTDOOR";
  private currentZone: string | null = null;
  private currentSeqIndex: number = -1;
  private neighborAskIndex: number = 0;
  private confidence: number = 0;
  
  private isScanning: boolean = false;
  private isManuallyPaused: boolean = false;
  private lastWalkingTime: number = Date.now();
  private lastStableTime: number = Date.now();
  private departureDetected: boolean = false;
  
  // Debug values
  private gpsAccuracy: number = 0;
  private wifiCount: number = 0;
  private avgRSSI: number = 0;

  async start() {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log("🚀 [SpatialOrchestrator] Starting loop...");
    this.runLoop();
  }

  public manualStart() {
    console.log("🚀 [SpatialOrchestrator] Manual start triggered at Entrance");
    this.currentSeqIndex = 0;
    this.transitionToEntrance();
  }

  stop() {
    this.isScanning = false;
    console.log("🛑 [SpatialOrchestrator] Stopped");
  }

  public pause() {
    this.isManuallyPaused = true;
    console.log("⏸ [SpatialOrchestrator] Manually paused.");
  }

  public resume() {
    this.isManuallyPaused = false;
    console.log("▶️ [SpatialOrchestrator] Resumed.");
  }

  private async runLoop() {
    while (this.isScanning) {
      try {
        // 1. GPS
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          this.gpsAccuracy = loc.coords.accuracy ?? 100;
        } catch {
          this.gpsAccuracy = 100;
        }

        // 2. WiFi (optional — gracefully absent in Expo Go)
        try {
          const wifiScan = await scanWifi();
          this.wifiCount = wifiScan.length;
          this.avgRSSI =
            this.wifiCount > 0
              ? wifiScan.reduce((s, a) => s + a.level, 0) / this.wifiCount
              : -100;
        } catch {
          this.wifiCount = 0;
          this.avgRSSI = -100;
        }

        // 3. Motion
        const { isMoving } = getMotion();
        if (isMoving) {
          this.lastWalkingTime = Date.now();
        }

        const now = Date.now();
        const isStillSpeaking = await ttsController.isSpeaking();

        // 2. State Logic — skipped when user is manually in control,
        // but sensors above always run so motion/GPS data stays fresh.
        if (!this.isManuallyPaused) {
        switch (this.currentState) {
          case "OUTDOOR":
            // Waiting for manualStart() or manual override
            break;

          case "ENTRANCE_LOCKED":
            if (!isStillSpeaking) {
                this.setState("WAITING_FOR_STOP");
            }
            break;

          case "WAITING_FOR_STOP":
            // To ensure we aren't repeatedly asking while they stand still *after* just finishing an audio,
            // we should wait until they ACTUALLY depart (start walking) and then arrive (stop walking).
            
            if (isMoving) {
              if (!this.departureDetected) {
                this.departureDetected = true;
                console.log("[SpatialOrchestrator] User started walking. Departure detected.");
              }
            } else {
              // They are still
              // Did they leave and arrive somewhere else?
              if (this.departureDetected && now - this.lastWalkingTime > 3000) {
                 this.departureDetected = false; // reset for next transition
                 this.setState("ASKING_ZONE");
                 this.neighborAskIndex = 0;
                 this.askNeighbor();
              } 
              // Or did they just stand still the whole time post audio?
              // The user asked: "if I don't walk at all... it asks me if I reached the next zone after a certain time"
              else if (!this.departureDetected && now - this.lastStableTime > 15000) {
                 console.log("[SpatialOrchestrator] User hasn't walked, suggesting next zone anyway based on estimated time.");
                 this.setState("ASKING_ZONE");
                 this.neighborAskIndex = 0;
                 this.askNeighbor();
              }
            }
            break;

          case "NARRATING":
            if (!isStillSpeaking) {
               this.setState("WAITING_FOR_STOP");
            }
            break;

          case "ASKING_ZONE":
            // Waiting for YES/NO
            break;
        }
        } // end if (!this.isManuallyPaused)
      } catch (err) {
        console.error("[SpatialOrchestrator] Loop error:", err);
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  private async askNeighbor() {
    // If we're at the very end, we shouldn't prompt for next. We're done.
    if (this.currentSeqIndex >= TOUR_SEQUENCE.length - 1) {
      return; 
    }

    // Sequence of questioning:
    // 1. Next zone
    // 2. We haven't reached the next zone yet (Still around current/previous area)
    const candidates = [];
    
    const nextIdx = this.currentSeqIndex + 1;
    const currentIdx = this.currentSeqIndex; // Haven't arrived or walked back slightly

    if (nextIdx < TOUR_SEQUENCE.length) candidates.push(TOUR_SEQUENCE[nextIdx]);
    if (currentIdx >= 0) candidates.push(TOUR_SEQUENCE[currentIdx]);
    
    // We can add skip (next-next) if we want, but keeping it simpler per user request
    const skipIdx = this.currentSeqIndex + 2;
    if (skipIdx < TOUR_SEQUENCE.length) candidates.push(TOUR_SEQUENCE[skipIdx]);

    const uniqueCandidates = Array.from(new Set(candidates));

    if (this.neighborAskIndex < uniqueCandidates.length) {
      const candidate = uniqueCandidates[this.neighborAskIndex];
      const displayName = candidate.replace(/_/g, ' ');
      const speechText = `Are you near the ${displayName}?`;
      
      this.currentZone = candidate; 
      
      // Check if we are asking for innovation lab. If so, add extra delay because of the longer walk
      if (candidate === 'innovation_lab') {
        await new Promise(r => setTimeout(r, 4000)); 
      }

      await ttsController.speak(speechText);
    } else {
      await ttsController.speak("I'm lost. Where are you?");
      this.setState("WAITING_FOR_STOP");
    }
  }

  public handleResponse(yes: boolean) {
    if (this.currentState !== "ASKING_ZONE") return;

    if (yes) {
      this.confidence = 1;
      this.currentSeqIndex = TOUR_SEQUENCE.indexOf(this.currentZone!);
      this.triggerNarration();
    } else {
      this.neighborAskIndex++;
      this.askNeighbor();
    }
  }

  private transitionToEntrance() {
    this.currentZone = "entrance";
    this.confidence = 0.8;
    this.setState("ENTRANCE_LOCKED");
    
    eventBus.emit({
      type: "ZONE_CHANGED",
      zoneId: "entrance",
      confidence: 0.8,
    });
  }

  private triggerNarration() {
    if (!this.currentZone) return;
    this.setState("NARRATING");
    eventBus.emit({
      type: "ZONE_CHANGED",
      zoneId: this.currentZone,
      confidence: 1,
    });
  }

  private setState(state: OrchestratorState) {
    if (this.currentState === state) return;
    console.log(`[SpatialOrchestrator] State Change: ${this.currentState} -> ${state}`);
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
      lastStableTime: this.lastStableTime
    };
  }
}

export const spatialOrchestrator = new SpatialOrchestrator();
