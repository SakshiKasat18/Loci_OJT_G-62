import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  Animated,
  Modal,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";

import { getToken, clearToken } from "../constants/auth";
import { apiFetch } from "../constants/api";
import {
  getZoneSegments,
  getZoneLabel,
  getZoneShortDesc,
  getZoneStatusLine,
} from "../core/ZoneScriptMapper";

import { startIMU, stopIMU } from "../services/imuTracker";
import { speechEngine } from "../core/SpeechEngine";
import { spatialOrchestrator } from "../services/spatialOrchestrator";
import { eventBus } from "../core/EventBus";
import { ttsController } from "../core/TTSController";

const ZONES = [
  "entrance",
  "reception",
  "radial_classroom",
  "admin_block",
  "cafeteria",
  "gaming_arcade",
  "innovation_lab",
] as const;

const TEAL = "#2dd4aa";
const SEGMENT_PAUSE = 800;
const START_DELAY = 800;

type State = "idle" | "playing" | "paused" | "done";

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function Guide() {
  const [state, setState] = useState<State>("idle");
  const [zoneIndex, setZoneIndex] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [showAsk, setShowAsk] = useState(false);
  const [replayHint, setReplayHint] = useState(false);
  const [debugText, setDebugText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [orchData, setOrchData] = useState<any>(null);
  const [isThinking, setIsThinking] = useState(false);
  /** Drives the subtle ambient listening indicator shown during auto-listen. */
  const [isAutoListening, setIsAutoListening] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  // [FIX-2] zoneIndex ref — always reflects current zone at transcription time,
  // not stale closure value captured when recording started.
  const zoneIndexRef = useRef(0);
  // [FIX-5] Mounted ref — prevents setState calls after component unmounts
  const mountedRef = useRef(true);

  const cancelRef = useRef(false);
  const sessionRef = useRef(0);

  // ── Auto-listen refs ────────────────────────────────────────────────────────
  /** True while a ZONE_QUESTION_ASKED-triggered auto-listen session is active. */
  const isAutoListeningRef = useRef(false);
  /** Timer that closes the auto-listen window after 5 s of silence. */
  const autoListenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * cancelAutoListenRef — cancels only the 5s timer and resets UI/state flags.
   * It does NOT stop the physical recording. Recording teardown is exclusively
   * handled by safeStopRecording() to prevent double-unload errors.
   */
  const cancelAutoListenRef = useRef<() => void>(() => {});

  // Deepgram API key — loaded from frontend/.env (EXPO_PUBLIC_DG_API_KEY).
  // Never hardcode keys in source. Rotate in .env only.
  const DG_API_KEY = process.env.EXPO_PUBLIC_DG_API_KEY ?? "";


  // Animations
  const screenFade = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const idleNodeAnim = useRef(new Animated.Value(0.4)).current;

  // Entry fade-in
  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auth check
  useEffect(() => {
    getToken().then((token) => {
      if (!token) router.replace("/login");
    });
  }, []);

  // Deepgram key presence check — fires once on mount
  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_DG_API_KEY) {
      console.error(
        "[LOCI] ⚠️  EXPO_PUBLIC_DG_API_KEY is not set.\n" +
        "  Add it to frontend/.env and restart Expo with --clear:\n" +
        "  EXPO_PUBLIC_DG_API_KEY=your_key_here"
      );
    } else {
      console.log("[LOCI] ✅ Deepgram key loaded from env.");
    }
  }, []);


  // Cleanup + mounted guard
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; // [FIX-5] blocks setState after unmount
      cancelRef.current = true;
      Speech.stop();
      // Cancel any active auto-listen window (clears timer + UI flag)
      cancelAutoListenRef.current();
      isAutoListeningRef.current = false;
      // Fire-and-forget recording stop on unmount (navigator away / app background)
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (autoListenTimeoutRef.current) {
        clearTimeout(autoListenTimeoutRef.current);
        autoListenTimeoutRef.current = null;
      }
    };
  }, []);

  // Global audio session
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  // Idle first-node breathing animation
  useEffect(() => {
    if (state !== "idle") {
      idleNodeAnim.stopAnimation();
      idleNodeAnim.setValue(0.4);
      return;
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(idleNodeAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(idleNodeAnim, { toValue: 0.4, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, [state, idleNodeAnim]);

  const startPulse = useCallback(() => {
    pulseScale.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseScale]);

  const stopPulse = useCallback(() => {
    pulseScale.stopAnimation();
    Animated.timing(pulseScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [pulseScale]);

  const crossFadeText = useCallback(
    (text: string) => {
      Animated.timing(textOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(
        () => {
          setStatusText(text);
          Animated.timing(textOpacity, { toValue: 1, duration: 320, useNativeDriver: true }).start();
        }
      );
    },
    [textOpacity]
  );

  const speak = useCallback(
    async (text: string, opts?: Speech.SpeechOptions): Promise<void> => {
      if (recordingRef.current) {
        console.log("[TTS] Blocked — recording is active.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      Speech.stop();
      return new Promise((resolve) => {
        Speech.speak(text, {
          language: "en-IN",
          rate: 0.72,
          pitch: 1.0,
          onDone: resolve,
          onError: () => resolve(),
          onStopped: resolve,
          ...opts,
        });
      });
    },
    []
  );

  const openSheet = useCallback(() => {
    setShowAsk(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, bounciness: 3 }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
      setShowAsk(false)
    );
  }, [sheetAnim]);



  const playZone = useCallback(
    async (index: number) => {
      if (index >= ZONES.length) {
        stopPulse();
        setState("done");
        crossFadeText("You've reached the end.");
        return;
      }

      cancelRef.current = false;
      const session = ++sessionRef.current;

      const zoneId = ZONES[index];

      // [FIX-2] Keep ref in sync
      zoneIndexRef.current = index;
      setZoneIndex(index);
      setState("playing");
      setReplayHint(false);
      crossFadeText(getZoneStatusLine(zoneId));
      startPulse();

      // TTS is handled exclusively by SpeechEngine via EventBus (TTSController).
      // speak() removed here to prevent double narration.

      if (cancelRef.current || sessionRef.current !== session) return;

      stopPulse();

      if (index >= ZONES.length - 1) {
        setState("done");
        crossFadeText("You've reached the end.");
      } else {
        crossFadeText("Waiting for next zone…");
      }
    },
    [startPulse, stopPulse, crossFadeText]
  );

  // --- Handlers ---

  const handleStart = useCallback(() => {
    spatialOrchestrator.manualStart();
  }, []);


  const handleStop = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    spatialOrchestrator.cancelAll();   // kills pending zone prompts
    setState("paused");
    crossFadeText("Paused.");
  }, [stopPulse, crossFadeText]);

  const handleResume = useCallback(() => playZone(zoneIndex), [zoneIndex, playZone]);

  const handleReplay = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    const zoneId = ZONES[zoneIndex];
    setZoneIndex(zoneIndex);
    setState("playing");
    crossFadeText(getZoneStatusLine(zoneId));
    startPulse();
    speechEngine.reset();
    spatialOrchestrator.skipToZone(zoneId); // re-center orchestrator, reset 15s clock
    eventBus.emit({ type: "ZONE_CHANGED", zoneId, confidence: 1 });
    setTimeout(() => stopPulse(), 8000);
  }, [zoneIndex, stopPulse, startPulse, crossFadeText]);

  const handleSkip = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    const next = zoneIndex + 1;
    if (next >= ZONES.length) {
      spatialOrchestrator.cancelAll();
      setState("done");
      crossFadeText("You've reached the end.");
      return;
    }
    const zoneId = ZONES[next];
    setZoneIndex(next);
    setState("playing");
    crossFadeText(getZoneStatusLine(zoneId));
    startPulse();
    speechEngine.reset();
    spatialOrchestrator.skipToZone(zoneId); // sync orchestrator to skipped zone
    eventBus.emit({ type: "ZONE_CHANGED", zoneId, confidence: 1 });
    setTimeout(() => stopPulse(), 8000);
  }, [zoneIndex, stopPulse, startPulse, crossFadeText]);

  const handleLogout = useCallback(async () => {
    cancelRef.current = true;
    Speech.stop();
    await clearToken();
    router.replace("/login");
  }, []);

  const handleAskPrompt = useCallback(
    async (type: "where" | "what" | "next") => {
      cancelRef.current = true;
      sessionRef.current++;
      Speech.stop();
      stopPulse();
      setState("paused");
      setReplayHint(false);

      const currentIdx = zoneIndexRef.current;
      const zoneId        = ZONES[currentIdx];
      const previousZone  = currentIdx > 0 ? ZONES[currentIdx - 1] : null;
      const nextZone      = currentIdx < ZONES.length - 1 ? ZONES[currentIdx + 1] : null;

      const questions: Record<string, string> = {
        where: "Where am I right now?",
        what:  "What is this space?",
        next:  "Where do I go next?",
      };

      const question = questions[type];

      closeSheet();
      await wait(300);

      setDebugText(`Sending: "${question}"`);
      crossFadeText("Thinking...");
      console.log(`[Ask Loci] Question: "${question}" | Zone: ${zoneId} | Next: ${nextZone}`);

      try {
        const token = await getToken();
        const res = await apiFetch("/ai/qa", {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({
            question,
            pack_id:       "a3_polaris",
            zone:          zoneId,
            previous_zone: previousZone,
            next_zone:     nextZone,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data   = await res.json();
        const answer = (data.answer ?? "").trim();

        console.log("[Ask Loci] AI answer:", answer);
        await speak(answer || "I'm here to guide you through the spaces around you.", { rate: 0.78 });
      } catch (err) {
        console.warn("[Ask Loci] Error:", err);
        setDebugText("Something went wrong.");
        await speak("Something went wrong. Please try again.", { rate: 0.78 });
      } finally {
        setReplayHint(true);
      }
    },
    [zoneIndexRef, closeSheet, speak, stopPulse, crossFadeText]
  );

  // ── Deepgram STT helper — called after every recording stop ──────────────
  // [FIX-2] Uses zoneIndexRef (not zoneIndex closure) so zone is always current.
  // [FIX-3] setIsThinking(false) on ALL exit paths via finally.
  const transcribeAudio = useCallback(async (uri: string) => {
    if (!mountedRef.current) return;
    console.log("[STT] transcribeAudio called. URI:", uri);
    setIsThinking(true);

    try {
      // [FIX-4] Local file:// URIs on Android don't return ok:true from fetch().
      // Read blob directly without checking ok — if the file doesn't exist,
      // blob() will throw, which is caught below.
      console.log("[STT] Reading audio file from device...");
      const fileRes = await fetch(uri);
      const audioBlob = await fileRes.blob();

      // File size guard — reject recordings that are too short
      const fileSizeKB = audioBlob.size / 1024;
      console.log(`[STT] Audio file size: ${fileSizeKB.toFixed(1)} KB`);
      if (fileSizeKB < 10) {
        console.warn("[STT] File too small — recording likely too short.");
        if (mountedRef.current) {
          setDebugText(`Recording too short (${fileSizeKB.toFixed(1)} KB). Hold mic longer.`);
        }
        await speak("Recording was too short. Please hold and speak again.", { rate: 0.78 });
        return; // finally will still run → setIsThinking(false)
      }

      // Send to Deepgram
      console.log("[STT] Sending to Deepgram...");
      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=en",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${DG_API_KEY}`,
            "Content-Type": "audio/mp4",
          },
          body: audioBlob,
        }
      );

      const dgData = await dgRes.json();

      if (!dgRes.ok) {
        console.warn("[STT] Deepgram API error:", dgRes.status, dgData);
        if (mountedRef.current) setDebugText(`Deepgram error ${dgRes.status}: ${dgData?.err_msg ?? "unknown"}`);
        await speak("Speech service error. Please try again.", { rate: 0.78 });
        return;
      }

      const transcript: string =
        dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const dgConfidence = dgData?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0;
      const dgDuration = dgData?.metadata?.duration ?? 0;
      console.log(`[STT] Transcript: "${transcript}" | Confidence: ${dgConfidence} | Duration: ${dgDuration}s`);

      if (!transcript.trim()) {
        console.log("[STT] No speech detected in audio.");
        if (mountedRef.current) setDebugText("No speech detected.");
        // During auto-listen, silence is not an error — stay quiet and let timeout expire.
        if (!isAutoListeningRef.current) {
          await speak("I didn't catch that. Please try again.", { rate: 0.78 });
        }
        return;
      }

      // ── PROGRESSION INTENT INTERCEPTOR ─────────────────────────────────────
      // CRITICAL: This check runs BEFORE the AI QA call.
      // Gate: fires if auto-listen is active OR orchestrator is in ASKING_ZONE.
      // Using both gates prevents the race where the orchestrator's 2s loop
      // ticks and changes state between Deepgram returning and this check.
      const orchState = spatialOrchestrator.getData().currentState;
      const inProgressionContext = isAutoListeningRef.current || orchState === "ASKING_ZONE";

      // Normalize transcript: lowercase → trim → strip punctuation → collapse whitespace
      const normalized = transcript
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      console.log(
        `[STT] Raw: "${transcript}" | Normalized: "${normalized}" | orchState: ${orchState} | autoListen: ${isAutoListeningRef.current}`
      );


      if (inProgressionContext) {
        // ── Core yes-word match (fires in any progression context) ──────────
        const isStrictYes = /^(yes|yeah|yep|sure|correct|right|okay|ok|yup)$/.test(normalized) ||
                            /\b(yes|yeah|yep|sure|correct|right)\b/.test(normalized);

        // ── Semantic movement confirmation (only while actively being asked) ─
        // Catches: "i am heading towards the reception", "going to the cafeteria",
        //          "moving towards admin block", "heading there", "yes reception".
        const isMovementYes = orchState === "ASKING_ZONE" && (
          /\b(heading|going|moving|walking|towards|toward|there|let's go|lets go)\b/.test(normalized)
        );

        const isYes = isStrictYes || isMovementYes;

        const isNo   = /^(no|nope|nah|wrong)$/.test(normalized) ||
                       /\b(no|nope|nah|wrong)\b/.test(normalized);
        const isRpt  = /\b(repeat|again|say that again|what did you say|pardon|come again)\b/.test(normalized);
        const isSkip = /\b(skip|next|move on|continue|forward|go ahead)\b/.test(normalized);

        if (isYes) {
          const reason = isMovementYes ? "MOVEMENT_PHRASE" : "YES_WORD";
          console.log(`[VOICE_INTENT_DETECTED] YES (${reason}): "${normalized}"`);
          console.log("[VOICE_INTENT_CONFIRMED] Calling handleResponse(true) — QA_BYPASSED");
          spatialOrchestrator.handleResponse(true);
          if (mountedRef.current) setDebugText("✓ Voice: YES");
          return;
        }


        if (isNo) {
          console.log("[VOICE_INTENT_DETECTED] NO");
          console.log("[VOICE_INTENT_CONFIRMED] Calling handleResponse(false) — QA_BYPASSED");
          spatialOrchestrator.handleResponse(false);
          if (mountedRef.current) setDebugText("\u2713 Voice: NO");
          return;
        }

        if (isRpt) {
          console.log("[VOICE_INTENT_DETECTED] REPEAT");
          console.log("[VOICE_INTENT_CONFIRMED] REPEAT_TRIGGERED — QA_BYPASSED");
          if (mountedRef.current) setDebugText("\u2713 Voice: Repeating...");
          await spatialOrchestrator.repeatLastQuestion();
          return; // repeatLastQuestion re-emits ZONE_QUESTION_ASKED → new auto-listen window
        }

        if (isSkip) {
          console.log("[VOICE_INTENT_DETECTED] SKIP");
          console.log("[VOICE_INTENT_CONFIRMED] SKIP_TRIGGERED — QA_BYPASSED");
          spatialOrchestrator.handleResponse(false);
          if (mountedRef.current) setDebugText("\u2713 Voice: Skipping...");
          return;
        }

        // No navigation intent matched — fall through to AI QA
        console.log(`[VOICE_INTENT_IGNORED] No progression intent in: "${normalized}" — QA_FALLTHROUGH`);
      }

      if (!mountedRef.current) return;
      setDebugText(`"${transcript}"`);

      // Stop any ongoing narration before answering
      cancelRef.current = true;
      sessionRef.current++;
      Speech.stop();
      stopPulse();
      setState("paused");

      // Pause the orchestrator's 15s timer while the AI is handling this question.
      // Without this, the timer could fire mid-AI-response and interrupt with a
      // progression prompt ("Are you heading towards...") causing overlapping TTS.
      spatialOrchestrator.cancelAll();

      // Always read zone from ref — never from stale closure
      const currentIdx   = zoneIndexRef.current;
      const zoneId       = ZONES[currentIdx] ?? "unknown";
      const previousZone = currentIdx > 0 ? ZONES[currentIdx - 1] : null;
      const nextZone     = currentIdx < ZONES.length - 1 ? ZONES[currentIdx + 1] : null;

      console.log(`[AI] Sending to backend. Question: "${transcript}" | Zone: ${zoneId} | Next: ${nextZone}`);
      if (mountedRef.current) setDebugText(`Asking AI: "${transcript}"`);

      const token = await getToken();
      const res = await apiFetch("/ai/qa", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({
          question:      transcript,
          pack_id:       "a3_polaris",
          zone:          zoneId,
          previous_zone: previousZone,
          next_zone:     nextZone,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`AI HTTP ${res.status}: ${errText}`);
      }

      const data   = await res.json();
      const answer = (data.answer ?? "").trim();
      // Deep log: expose the full backend payload so we can verify LLM output
      // is reaching the frontend without any validation stripping.
      console.log("[AI] Raw backend payload:", JSON.stringify(data));
      console.log("[AI] Final answer to speak:", answer);

      await speak(answer || "I'm here to guide you through the spaces around you.", { rate: 0.78 });
      if (mountedRef.current) setReplayHint(true);

      // Cooldown: wait 1.5s after AI speaks before resuming the orchestrator.
      // This prevents an instant auto-listen trigger if the 15s timer was close
      // to firing before this AI interaction began.
      await wait(1500);
      const resumeZone = ZONES[zoneIndexRef.current];
      if (resumeZone && mountedRef.current) {
        spatialOrchestrator.skipToZone(resumeZone);
        console.log(`[AI] Orchestrator resumed at zone: ${resumeZone} — 15s clock restarted.`);
      }
    } catch (err) {
      console.warn("[STT/AI] Pipeline error:", err);
      if (mountedRef.current) setDebugText("Something went wrong. Try again.");
      await speak("Something went wrong.", { rate: 0.78 });
    } finally {
      if (mountedRef.current) setIsThinking(false);
      // Reset auto-listen UI state. The recording has already been stopped by
      // safeStopRecording() before transcribeAudio was called, so we only need
      // to clear the timer and the UI flag here.
      cancelAutoListenRef.current();
    }
  }, [speak, stopPulse]);

  /**
   * safeStopRecording — the ONLY function allowed to call stopAndUnloadAsync().
   *
   * Idempotent: if a stop is already in progress (isStoppingRef), returns immediately.
   * Returns the audio URI on success, or null if nothing was recorded / already stopped.
   *
   * Correct call sequence for every recording path:
   *   1. const uri = await safeStopRecording();
   *   2. if (uri) await transcribeAudio(uri);
   *   3. cancelAutoListenRef.current()  [auto-listen only]
   */
  const safeStopRecording = useCallback(async (): Promise<string | null> => {
    const rec = recordingRef.current;
    if (!rec) {
      console.log("[RECORDING_STOP_SKIPPED] No active recording ref.");
      return null;
    }
    if (isStoppingRef.current) {
      console.log("[RECORDING_STOP_SKIPPED_ALREADY_STOPPING] Stop already in progress.");
      return null;
    }

    console.log("[RECORDING_STOP_REQUESTED]");
    isStoppingRef.current = true;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI() ?? null;
      console.log(uri ? `[RECORDING_URI_READY] ${uri}` : "[RECORDING_URI_READY] null — nothing captured");
      return uri;
    } catch (err) {
      // Expo throws if the recording was already unloaded by another path.
      // Treat this as a non-fatal: the recording is gone, URI is lost.
      console.warn("[RECORDING_STOP_ERROR] stopAndUnloadAsync failed:", err);
      return null;
    } finally {
      // Always release ownership so next recording can start cleanly
      recordingRef.current = null;
      isStoppingRef.current = false;
      console.log("[RECORDING_STOP_SUCCESS]");
    }
  }, []);

  /**
   * Temporary auto-listen engine.
   *
   * Triggered by ZONE_QUESTION_ASKED after the orchestrator's TTS resolves.
   * Opens the mic for up to 5 s. If the user speaks, safeStopRecording() is
   * called exactly once, then transcribeAudio() handles intent + AI QA.
   *
   * Responsibility split:
   *   safeStopRecording()    → physical recording lifecycle (one owner, idempotent)
   *   cancelAutoListenRef()  → timer + UI flag only (never touches recording)
   */
  const startAutoListen = useCallback(async () => {
    // Gate 1: No duplicate sessions
    if (isAutoListeningRef.current) {
      console.log("[AUTO_LISTEN] Already active — ignoring duplicate trigger.");
      return;
    }
    // Gate 2: Manual recording already in progress
    if (recordingRef.current || isStoppingRef.current) {
      console.log("[AUTO_LISTEN] Manual recording active — skipping auto-listen.");
      return;
    }

    // Gate 3: Wait for TTS to fully release + OS audio routing buffer
    const stillSpeaking = await ttsController.isSpeaking();
    if (stillSpeaking) {
      console.log("[AUTO_LISTEN] TTS still active — waiting 600 ms for audio focus release.");
      await wait(600);
    } else {
      await wait(500); // safety buffer even when TTS reports done
    }

    // Gate 4: Orchestrator may have moved on during our wait
    if (spatialOrchestrator.getData().currentState !== "ASKING_ZONE") {
      console.log("[AUTO_LISTEN] Orchestrator left ASKING_ZONE during delay — aborting.");
      return;
    }
    // Gate 5: Race — another path opened a recording during the delay
    if (isAutoListeningRef.current || recordingRef.current) {
      console.log("[AUTO_LISTEN] Recording started by another path during delay — aborting.");
      return;
    }
    if (!mountedRef.current) return;

    // ── All gates passed: enter auto-listen ─────────────────────────────────
    isAutoListeningRef.current = true;
    if (mountedRef.current) setIsAutoListening(true);

    // Register cancelAutoListenRef for this session.
    // Scope: cancels the 5s timer + resets UI/flag. NEVER stops the recording.
    cancelAutoListenRef.current = () => {
      if (autoListenTimeoutRef.current) {
        clearTimeout(autoListenTimeoutRef.current);
        autoListenTimeoutRef.current = null;
      }
      isAutoListeningRef.current = false;
      if (mountedRef.current) setIsAutoListening(false);
      cancelAutoListenRef.current = () => {}; // reset to no-op
    };

    console.log("[AUTO_LISTEN] AUTO_LISTEN_STARTED");

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        console.warn("[AUTO_LISTEN] Microphone permission denied.");
        cancelAutoListenRef.current();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Check again: something may have cancelled us during async permission call
      if (!isAutoListeningRef.current || !mountedRef.current) {
        console.log("[AUTO_LISTEN] Cancelled during permission check — aborting.");
        return;
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      console.log("[RECORDING_STARTED] Auto-listen recording active.");

      recordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      isStoppingRef.current = false;

      // 5-second silence window
      autoListenTimeoutRef.current = setTimeout(async () => {
        if (!isAutoListeningRef.current) return;
        console.log("[AUTO_LISTEN] AUTO_LISTEN_TIMEOUT — 5 s elapsed, finalising recording.");

        // Step 1: cancel the timer/UI state (does NOT touch the recording)
        cancelAutoListenRef.current();

        // Step 2: stop the recording exactly once via the safe helper
        const uri = await safeStopRecording();

        // Step 3: release audio mode back to playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        // Step 4: attempt transcription (silence is handled gracefully inside)
        if (uri && mountedRef.current) {
          console.log("[TRANSCRIPTION_STARTED] Sending timeout audio to Deepgram.");
          await transcribeAudio(uri);
        }
      }, 3000);
    } catch (err) {
      console.warn("[AUTO_LISTEN] Failed to start recording:", err);
      cancelAutoListenRef.current();
    }
  }, [safeStopRecording, transcribeAudio]);

  const handleMicPress = useCallback(async () => {
    // Demo safety: block manual recording while TTS is actively speaking.
    // Prevents narration audio bleeding into the STT capture window.
    const speaking = await ttsController.isSpeaking();
    if (speaking) {
      console.log("[MANUAL_MIC_BLOCKED] TTS is active — ignoring mic press to prevent bleed.");
      return;
    }

    // If auto-listen is running: cancel the timer/UI state, then let the
    // manual recording flow continue normally. safeStopRecording below will
    // handle stopping whatever the auto-listen session was recording.
    if (isAutoListeningRef.current) {
      console.log("[MANUAL_OVERRIDE] Manual mic press — cancelling auto-listen.");
      cancelAutoListenRef.current(); // sync: only clears timer + UI, not recording
    }

    // ── STOP if already recording ──────────────────────────────────────────
    if (isRecording || recordingRef.current) {
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      // Honour the minimum 2.5 s capture window to ensure Deepgram gets enough audio
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const remaining = Math.max(0, 2500 - elapsed);
      if (remaining > 0) {
        setDebugText(`Recording... (${(remaining / 1000).toFixed(1)}s remaining)`);
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      console.log("[RECORDING_STOP_REQUESTED] Manual stop.");
      const uri = await safeStopRecording(); // single owner — no double-unload possible

      setIsRecording(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      if (uri) {
        console.log("[RECORDING_URI_READY] Manual recording.", uri);
        console.log("[TRANSCRIPTION_STARTED] Sending manual recording to Deepgram.");
        await transcribeAudio(uri);
        console.log("[TRANSCRIPTION_COMPLETED] Manual flow done.");
      } else {
        setDebugText("Recording too short or failed. Try again.");
      }
      return;
    }

    // ── START recording ────────────────────────────────────────────────────
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setDebugText("Microphone permission denied.");
        console.warn("[Mic] Permission denied.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      setDebugText("Recording… speak now");
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      console.log("[RECORDING_STARTED] Manual recording active.");

      recordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      isStoppingRef.current = false;
      setIsRecording(true);

      // 7-second auto-stop for manual recordings
      recordingTimerRef.current = setTimeout(async () => {
        if (!recordingRef.current || isStoppingRef.current) return;
        console.log("[RECORDING_STOP_REQUESTED] Manual 7 s auto-stop.");

        const uri = await safeStopRecording();
        setIsRecording(false);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        if (uri) {
          console.log("[TRANSCRIPTION_STARTED] 7 s auto-stop audio to Deepgram.");
          await transcribeAudio(uri);
          console.log("[TRANSCRIPTION_COMPLETED] 7 s auto-stop done.");
        }
      }, 7000);
    } catch (err) {
      console.warn("[Mic] Start error:", err);
      setDebugText("Failed to start recording.");
      setIsRecording(false);
    }
  }, [isRecording, safeStopRecording, transcribeAudio]);

  // --- Effects ---

  // Entry fade-in
  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [screenFade]);

  // Lifecycle and Services
  useEffect(() => {
    console.log("[GUIDE] Guide mounted.");
    startIMU();
    speechEngine.init();

    // Start the sensor loop (idempotent — safe to call even if already running)
    spatialOrchestrator.start();

    // If orchestrator is already active (coming from onboarding's manualStart),
    // skip the idle state entirely so the 'Start Experience' button never appears.
    // This prevents the user from triggering a second manualStart().
    const orchState = spatialOrchestrator.getData().currentState;
    if (orchState !== "OUTDOOR" && orchState !== "TOUR_FINISHED") {
      console.log(`[GUIDE] Orchestrator already active (${orchState}) — skipping idle state.`);
      setState("playing");
    }

    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === "ZONE_CHANGED") {
        const idx = ZONES.indexOf(event.zoneId as any);
        if (idx !== -1) {
          // [FIX-2] Keep zoneIndexRef in sync with the state update
          zoneIndexRef.current = idx;
          setZoneIndex(idx);
          setState("playing");
          crossFadeText(getZoneStatusLine(event.zoneId));
          startPulse();
          setTimeout(() => stopPulse(), 8000);
        }
      }
      if (event.type === "TOUR_FINISHED") {
        setState("done");
        crossFadeText("The tour has ended.");
        stopPulse();
      }
      if (event.type === "ZONE_QUESTION_ASKED") {
        // The orchestrator just finished speaking a progression question.
        // Open a temporary 3-second listening window so the user can respond
        // hands-free. startAutoListen has its own safety gates.
        startAutoListen();
      }
    });

    const timer = setInterval(() => {
      setOrchData(spatialOrchestrator.getData());
    }, 1000);

    return () => {
      console.log("[GUIDE] Guide unmounting — cleaning up.");
      cancelRef.current = true;
      Speech.stop();
      stopIMU();
      speechEngine.destroy();
      spatialOrchestrator.stop();
      unsubscribe();
      clearInterval(timer);
      // Clean up any active auto-listen session on unmount
      if (autoListenTimeoutRef.current) clearTimeout(autoListenTimeoutRef.current);
      isAutoListeningRef.current = false;
    };
  }, [crossFadeText, startPulse, stopPulse, startAutoListen]);


  // Idle breathing
  useEffect(() => {
    if (state !== "idle") {
      idleNodeAnim.stopAnimation();
      idleNodeAnim.setValue(0.4);
      return;
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(idleNodeAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(idleNodeAnim, { toValue: 0.4, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, [state, idleNodeAnim]);

  const sheetY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });
  const isActive = state === "playing" || state === "paused";
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isDone = state === "done";
  const currentZoneId = ZONES[zoneIndex];

  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.topBar}>
        <Text style={styles.topLocation}>A3 Polaris — Ground Floor</Text>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.mainArea}>
        <View style={styles.contentCol}>
          {state === "idle" && (
            <View>
              <Text style={styles.idleLabel}>Audio Guide</Text>
              <Text style={styles.idleDesc}>Put on your headphones and follow the voice.</Text>
              <Pressable
                style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]}
                onPress={handleStart}
                accessibilityRole="button"
              >
                <Text style={styles.startBtnText}>Start Experience</Text>
              </Pressable>
            </View>
          )}

          {state !== "idle" && (
            <Animated.View style={{ opacity: textOpacity }}>
              {(isActive || isDone) && (
                <Text style={styles.zoneName}>
                  {isDone ? "Tour Complete" : getZoneLabel(currentZoneId)}
                </Text>
              )}
              <Text style={styles.statusText}>{statusText}</Text>
              {replayHint && <Text style={styles.replayHint}>Replay to hear this again</Text>}
              {isDone && (
                <Pressable style={styles.restartBtn} onPress={handleStart}>
                  <Text style={styles.restartBtnText}>Restart Tour</Text>
                </Pressable>
              )}
            </Animated.View>
          )}



          {orchData?.currentState === "ASKING_ZONE" && (
            <View style={styles.promptActions}>
              <Pressable
                style={[styles.actionBtn, styles.yesBtn]}
                onPress={async () => {
                  // MANUAL_OVERRIDE: stop auto-listen recording + cancel UI state.
                  // Must stop recording to prevent the 5s timeout from firing a
                  // delayed transcript after progression has already advanced.
                  if (isAutoListeningRef.current) {
                    console.log("[MANUAL_OVERRIDE] YES button — stopping auto-listen recording.");
                    cancelAutoListenRef.current(); // clears timer + UI (sync)
                    await safeStopRecording();     // discards the in-flight recording
                  }
                  spatialOrchestrator.handleResponse(true);
                }}
              >
                <Text style={styles.actionBtnText}>YES</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.noBtn]}
                onPress={async () => {
                  if (isAutoListeningRef.current) {
                    console.log("[MANUAL_OVERRIDE] NO button — stopping auto-listen recording.");
                    cancelAutoListenRef.current();
                    await safeStopRecording();
                  }
                  spatialOrchestrator.handleResponse(false);
                }}
              >
                <Text style={styles.actionBtnText}>NO</Text>
              </Pressable>
            </View>
          )}

          {/* Auto-listen ambient indicator — appears only during the 4s window */}
          {isAutoListening && (
            <View style={styles.autoListenRow}>
              <View style={styles.autoListenDot} />
              <Text style={styles.autoListenText}>Listening…</Text>
            </View>
          )}
        </View>

        <View style={styles.pathCol}>
          {ZONES.map((_, i) => {
            const completed = isActive && i < zoneIndex;
            const current = isActive && i === zoneIndex;
            const upcoming = !completed && !current;
            const isIdleFirst = state === "idle" && i === 0;
            return (
              <View key={i} style={styles.nodeWrap}>
                <Animated.View style={[
                  styles.node,
                  completed && styles.nodeCompleted,
                  current && styles.nodeCurrent,
                  upcoming && styles.nodeUpcoming,
                  current && { transform: [{ scale: pulseScale }] },
                  isIdleFirst && { opacity: idleNodeAnim, borderColor: TEAL },
                ]}>
                  {current && <View style={styles.nodeInner} />}
                </Animated.View>
                {i < ZONES.length - 1 && <View style={[styles.vline, completed && styles.vlineCompleted]} />}
              </View>
            );
          })}
        </View>
      </View>

      {isActive && (
        <View style={styles.controls}>
          {isPlaying && (
            <Pressable style={styles.ctrlBtn} onPress={handleStop}>
              <Text style={styles.ctrlText}>Stop</Text>
            </Pressable>
          )}
          <Pressable style={styles.ctrlBtn} onPress={handleReplay}>
            <Text style={[styles.ctrlText, isPaused && styles.ctrlPrimary]}>Replay</Text>
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={handleSkip}>
            <Text style={styles.ctrlText}>Skip</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={styles.aiFloat} onPress={openSheet}>
        <Text style={styles.aiIcon}>◎</Text>
      </Pressable>

      <Modal transparent visible={showAsk} animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ask Loci</Text>
          <View style={styles.promptList}>
            <Text style={styles.promptHint}>
              You can ask things like:{"\n"}
              {"\u2022"} Where am I right now?{"\n"}
              {"\u2022"} What is this place?{"\n"}
              {"\u2022"} Where should I go next?
            </Text>
          </View>

          {isThinking && (
            <Text style={styles.thinkingText}>Thinking…</Text>
          )}

          <Pressable
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPress={handleMicPress}
          >
            <Text style={[styles.micIcon, isRecording && styles.micIconActive]}>
              {isRecording ? "⏹" : "⊙"}
            </Text>
          </Pressable>
        </Animated.View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 28,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 52,
    paddingBottom: 12,
  },
  topLocation: {
    color: "#999",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  logoutBtn: {
    paddingTop: 2,
  },
  logoutText: {
    color: "#bbb",
    fontSize: 13,
  },

  // Main two-column area
  mainArea: {
    flex: 1,
    flexDirection: "row",
    paddingTop: 20,
    paddingBottom: 8,
  },

  // Left content
  contentCol: {
    flex: 1,
    paddingRight: 28,
    justifyContent: "center",
    paddingTop: 40,
  },
  idleLabel: {
    color: "#bbb",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  idleDesc: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "300",
    lineHeight: 20,
    marginBottom: 32,
    maxWidth: "90%",
  },
  startBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 2,
  },
  startBtnText: {
    color: "#111",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.35,
  },
  zoneName: {
    color: "#777",
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  statusText: {
    color: "#111",
    fontSize: 24,
    fontWeight: "300",
    letterSpacing: 0.2,
    lineHeight: 32,
    maxWidth: "95%",
  },
  replayHint: {
    color: "#bbb",
    fontSize: 12,
    marginTop: 16,
    letterSpacing: 0.3,
  },
  restartBtn: {
    alignSelf: "flex-start",
    marginTop: 32,
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 2,
  },
  restartBtnText: {
    color: "#111",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  // Right path column
  pathCol: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.72,
  },
  nodeWrap: {
    alignItems: "center",
  },
  node: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCompleted: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  nodeCurrent: {
    borderColor: TEAL,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  nodeUpcoming: {
    borderColor: "#e8e8e8",
  },
  nodeInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TEAL,
  },
  vline: {
    width: 1.5,
    height: 44,
    backgroundColor: "#e8e8e8",
  },
  vlineCompleted: {
    backgroundColor: TEAL,
  },

  // Controls — intentionally low visual weight; secondary to the experience
  controls: {
    flexDirection: "row",
    paddingBottom: 48,
    paddingTop: 8,
    gap: 16,
    alignItems: "center",
    opacity: 0.5,
  },
  ctrlBtn: {
    paddingVertical: 8,
  },
  ctrlText: {
    color: "#aaa",
    fontSize: 14,
  },
  ctrlPrimary: {
    color: "#666",
    fontWeight: "600",
  },

  // AI float
  aiFloat: {
    position: "absolute",
    bottom: 48,
    right: 28,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#c8ede5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  aiIcon: {
    color: TEAL,
    fontSize: 18,
  },

  // Bottom sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 48,
  },
  sheetHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#e5e5e5",
    alignSelf: "center",
    marginBottom: 24,
  },
  sheetTitle: {
    color: "#111",
    fontSize: 17,
    fontWeight: "400",
    marginBottom: 20,
  },
  promptList: {
    gap: 10,
    marginBottom: 28,
  },
  prompt: {
    borderWidth: 1,
    borderColor: "#efefef",
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  promptText: {
    color: "#444",
    fontSize: 14,
  },
  promptHint: {
    color: "#666",
    fontSize: 14,
    lineHeight: 26,
    paddingHorizontal: 4,
  },
  thinkingText: {
    color: TEAL,
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 8,
  },
  micBtn: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f6fdfb",
    borderWidth: 1,
    borderColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: {
    backgroundColor: "#fff0f0",
    borderColor: "#ff4444",
  },
  micIcon: {
    color: TEAL,
    fontSize: 20,
  },
  micIconActive: {
    color: "#ff4444",
  },
  debugBox: {
    marginTop: 40,
    padding: 12,
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  debugText: {
    fontSize: 10,
    color: "#888",
    fontFamily: "monospace" as any,
    marginBottom: 2,
  },
  promptActions: {
    flexDirection: "row" as const,
    marginTop: 24,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center" as const,
  },
  yesBtn: {
    backgroundColor: TEAL,
  },
  noBtn: {
    backgroundColor: "#f0f0f0",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "bold" as const,
    fontSize: 14,
  },
  // Auto-listen ambient indicator
  autoListenRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 20,
    gap: 7,
  },
  autoListenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TEAL,
    opacity: 0.85,
  },
  autoListenText: {
    color: TEAL,
    fontSize: 12,
    fontWeight: "400" as const,
    letterSpacing: 0.4,
    opacity: 0.85,
  },
});
