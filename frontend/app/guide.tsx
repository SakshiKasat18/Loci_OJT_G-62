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

const ZONES = [
  "reception",
  "merchandise_display",
  "radial_classroom",
  "creator_zone",
  "cafeteria",
  "wormhole",
] as const;

const TEAL = "#2dd4aa";
const SEGMENT_PAUSE = 800;
const START_DELAY = 800;
const BETWEEN_DELAY = 2000;

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

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);          // lock: prevents double-stop race
  const recordingStartTimeRef = useRef(0);      // timestamp: enforces minimum duration

  const cancelRef = useRef(false);
  const sessionRef = useRef(0);

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

  // Cleanup
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      Speech.stop();
    };
  }, []);

  // Global audio session — prevents cracking and session conflicts
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,          // must be true — Android needs this to acquire audio focus
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

  const openSheet = useCallback(() => {
    setShowAsk(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, bounciness: 3 }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
      setShowAsk(false)
    );
  }, [sheetAnim]);

  const sheetY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });

  const speak = useCallback(
    async (text: string, opts?: Speech.SpeechOptions): Promise<void> => {
      // Block TTS if microphone is active — prevents audio session corruption
      if (recordingRef.current) {
        console.log("[TTS] Blocked — recording is active.");
        return;
      }
      // Switch session to playback mode before speaking
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
          onError: resolve,
          onStopped: resolve,
          ...opts,
        });
      });
    },
    []
  );

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
      const segments = getZoneSegments(zoneId);

      setZoneIndex(index);
      setState("playing");
      setReplayHint(false);
      crossFadeText(getZoneStatusLine(zoneId));
      startPulse();

      await wait(START_DELAY);
      if (cancelRef.current || sessionRef.current !== session) return;

      for (let i = 0; i < segments.length; i++) {
        if (cancelRef.current || sessionRef.current !== session) return;
        await speak(segments[i]);
        if (cancelRef.current || sessionRef.current !== session) return;
        if (i < segments.length - 1) await wait(SEGMENT_PAUSE);
      }

      if (cancelRef.current || sessionRef.current !== session) return;

      stopPulse();

      if (index < ZONES.length - 1) {
        crossFadeText("Walking…");
        await wait(BETWEEN_DELAY);
        if (cancelRef.current || sessionRef.current !== session) return;
        playZone(index + 1);
      } else {
        setState("done");
        crossFadeText("You've reached the end.");
      }
    },
    [startPulse, stopPulse, crossFadeText, speak]
  );

  const handleStart = useCallback(() => {
    setZoneIndex(0);
    playZone(0);
  }, [playZone]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    setState("paused");
    crossFadeText("Paused.");
  }, [stopPulse, crossFadeText]);

  const handleResume = useCallback(() => playZone(zoneIndex), [zoneIndex, playZone]);

  const handleReplay = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    setTimeout(() => playZone(zoneIndex), 150);
  }, [zoneIndex, playZone, stopPulse]);

  const handleSkip = useCallback(() => {
    cancelRef.current = true;
    sessionRef.current++;
    Speech.stop();
    stopPulse();
    const next = zoneIndex + 1;
    if (next >= ZONES.length) {
      setState("done");
      crossFadeText("You've reached the end.");
      return;
    }
    setTimeout(() => playZone(next), 150);
  }, [zoneIndex, playZone, stopPulse, crossFadeText]);

  const handleLogout = useCallback(async () => {
    cancelRef.current = true;
    Speech.stop();
    await clearToken();
    router.replace("/login");
  }, []);

  const handleAskPrompt = useCallback(
    async (type: "where" | "what" | "next") => {
      // Fully interrupt zone audio — do not resume after
      cancelRef.current = true;
      sessionRef.current++;
      Speech.stop();
      stopPulse();
      setState("paused");
      setReplayHint(false);

      const zoneId = ZONES[zoneIndex];

      const questions: Record<string, string> = {
        where: "Where am I right now?",
        what: "What is this space?",
        next: "Where do I go next?",
      };

      const question = questions[type];

      closeSheet();
      await wait(300);

      // ── Debug: sending
      setDebugText(`Sending: "${question}"`);
      crossFadeText("Thinking...");
      console.log("[Ask Loci] Question:", question, "| Zone:", zoneId);

      try {
        const token = await getToken();
        const res = await apiFetch("/ai/qa", {
          method: "POST",
          token: token ?? undefined,
          body: JSON.stringify({ question, zone: zoneId }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const answer = data.answer || "I don't have that information.";

        // ── Debug: response received
        console.log("[Ask Loci] AI Response:", answer);
        setDebugText(`Asked: "${question}"\nAI: "${answer}"`);

        await speak(answer, { rate: 0.78 });
      } catch (err) {
        console.warn("[Ask Loci] Error:", err);
        setDebugText("Something went wrong.");
        await speak("Something went wrong.", { rate: 0.78 });
      } finally {
        setReplayHint(true);
      }
    },
    [zoneIndex, closeSheet, speak, stopPulse, crossFadeText]
  );

  // ── Deepgram STT helper — called after every recording stop ──────────────
  const transcribeAudio = useCallback(async (uri: string) => {
    console.log("[Deepgram] Sending file:", uri);
    setDebugText(`Sending to Deepgram...\n${uri}`);

    try {
      const fileRes = await fetch(uri);
      // FIX (Stage 5): verify local file fetch actually succeeded
      if (!fileRes.ok) {
        console.warn("[Deepgram] Audio file fetch failed:", fileRes.status);
        setDebugText(`Failed to read audio file (HTTP ${fileRes.status}).`);
        return;
      }
      const audioBlob = await fileRes.blob();

      // ── File size guard — reject recordings that are too short ───────────
      const fileSizeKB = audioBlob.size / 1024;
      console.log(`[Deepgram] File size: ${fileSizeKB.toFixed(1)} KB`);
      if (fileSizeKB < 10) {
        console.warn("[Deepgram] File too small — recording likely too short.");
        setDebugText(`Recording too short (${fileSizeKB.toFixed(1)} KB)\nHold mic longer and speak clearly.`);
        await speak("Recording was too short. Please hold and speak again.", { rate: 0.78 });
        return;
      }

      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=en",
        {
          method: "POST",
          headers: {
            Authorization: "Token 57a547e7e05d060a0f81139cbf0868ec36fd194c",
            "Content-Type": "audio/mp4", // .m4a container = audio/mp4 MIME type
          },
          body: audioBlob,
        }
      );

      const dgData = await dgRes.json();
      console.log("[Deepgram] Full response:", JSON.stringify(dgData));

      if (!dgRes.ok) {
        console.warn("[Deepgram] API error:", dgData);
        setDebugText(`Deepgram error:\n${JSON.stringify(dgData)}`);
        return;
      }

      const transcript: string =
        dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const confidence = dgData?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? "n/a";
      const duration = dgData?.metadata?.duration ?? "n/a";
      console.log(`[Deepgram] Confidence: ${confidence} | Duration: ${duration}s`);

      if (!transcript.trim()) {
        console.log("[Deepgram] No speech detected.");
        setDebugText("No speech detected.");
        await speak("I didn't catch that. Please try again.", { rate: 0.78 });
        return;
      }

      console.log("[Deepgram] Transcript:", transcript);
      setDebugText(`Transcript:\n"${transcript}"`);

      // ── Stop any ongoing narration before answering ──────────────────────
      cancelRef.current = true;
      sessionRef.current++;
      Speech.stop();
      stopPulse();
      setState("paused");

      // ── Send transcript to AI ────────────────────────────────────────────
      const zoneId = ZONES[zoneIndex];
      console.log("[Ask Loci] Sending to AI:", transcript, "| Zone:", zoneId);
      setDebugText(`Sending to AI:\n"${transcript}"`);

      const token = await getToken();
      const res = await apiFetch("/ai/qa", {
        method: "POST",
        token: token ?? undefined,
        body: JSON.stringify({ question: transcript, zone: zoneId }),
      });

      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);

      const data = await res.json();
      const answer = data.answer || "I don't have that information.";

      console.log("[Ask Loci] AI Response:", answer);
      setDebugText(`Asked: "${transcript}"\nAI: "${answer}"`);

      await speak(answer, { rate: 0.78 });
      setReplayHint(true);
    } catch (err) {
      console.warn("[Deepgram] Fetch error:", err);
      setDebugText("Something went wrong.");
      await speak("Something went wrong.", { rate: 0.78 });
    }
  }, [zoneIndex, speak, stopPulse]);

  const handleMicPress = useCallback(async () => {
    // ── STOP if already recording ─────────────────────────────────────────────
    if (isRecording && recordingRef.current) {
      // FIX (Stage 3): lock prevents double-stop from race condition
      if (isStoppingRef.current) {
        console.warn("[Mic] Stop already in progress — ignoring.");
        return;
      }
      isStoppingRef.current = true;

      console.log("[Mic] Stopping recording...");
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);

      // FIX (Stage 3): smart wait — only delay the remaining time, not a full 2.5s
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const remaining = Math.max(0, 2500 - elapsed);
      if (remaining > 0) {
        setDebugText(`Recording... (${(remaining / 1000).toFixed(1)}s remaining)`);
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        isStoppingRef.current = false;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        console.log("[Mic] Audio file:", uri);
        if (uri) await transcribeAudio(uri);
      } catch (err) {
        console.warn("[Mic] Stop error:", err);
        setDebugText("Failed to stop recording.");
        setIsRecording(false);
        isStoppingRef.current = false;
      }
      return;
    }

    // ── START recording ───────────────────────────────────────────────────────
    try {
      console.log("[Mic] Requesting permission...");
      const { granted } = await Audio.requestPermissionsAsync();
      console.log("[Mic] Permission granted:", granted); // FIX (Stage 1): log result
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

      console.log("[Mic] Recording start...");
      setDebugText("Recording... speak now");

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      console.log("[Mic] Recording active.");

      // Set state AFTER createAsync confirms recording is active
      recordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      isStoppingRef.current = false;
      setIsRecording(true);

      // Auto-stop after 7 seconds
      recordingTimerRef.current = setTimeout(async () => {
        if (!recordingRef.current || isStoppingRef.current) return;
        isStoppingRef.current = true;
        console.log("[Mic] Auto-stopping after 7s...");
        try {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();
          recordingRef.current = null;
          setIsRecording(false);
          isStoppingRef.current = false;

          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });

          console.log("[Mic] Auto-stop. Audio file:", uri);
          if (uri) await transcribeAudio(uri);
        } catch (err) {
          console.warn("[Mic] Auto-stop error:", err);
          setIsRecording(false);
          isStoppingRef.current = false;
        }
      }, 7000);
    } catch (err) {
      console.warn("[Mic] Start error:", err);
      setDebugText("Failed to start recording.");
      setIsRecording(false);
    }
  }, [isRecording, transcribeAudio]);

  const isActive = state === "playing" || state === "paused";
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isDone = state === "done";
  const currentZoneId = ZONES[zoneIndex];

  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topLocation}>A3 Polaris — Ground Floor</Text>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      {/* Main area: left = content, right = path */}
      <View style={styles.mainArea}>

        {/* Left: text content */}
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

              {replayHint && (
                <Text style={styles.replayHint}>Replay to hear this again</Text>
              )}

              {isDone && (
                <Pressable
                  style={({ pressed }) => [styles.restartBtn, pressed && styles.pressed]}
                  onPress={handleStart}
                  accessibilityRole="button"
                >
                  <Text style={styles.restartBtnText}>Restart Tour</Text>
                </Pressable>
              )}
            </Animated.View>
          )}
        </View>

        {/* Right: vertical path */}
        <View style={styles.pathCol}>
          {ZONES.map((_, i) => {
            const completed = isActive && i < zoneIndex;
            const current = isActive && i === zoneIndex;
            const upcoming = !completed && !current;
            const isIdleFirst = state === "idle" && i === 0;
            return (
              <View key={i} style={styles.nodeWrap}>
                <Animated.View
                  style={[
                    styles.node,
                    completed && styles.nodeCompleted,
                    current && styles.nodeCurrent,
                    upcoming && styles.nodeUpcoming,
                    current && { transform: [{ scale: pulseScale }] },
                    isIdleFirst && { opacity: idleNodeAnim, borderColor: TEAL },
                  ]}
                >
                  {current && <View style={styles.nodeInner} />}
                </Animated.View>
                {i < ZONES.length - 1 && (
                  <View style={[styles.vline, completed && styles.vlineCompleted]} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Controls */}
      {isActive && (
        <View style={styles.controls}>
          {isPlaying && (
            <Pressable
              style={({ pressed }) => [styles.ctrlBtn, pressed && styles.pressed]}
              onPress={handleStop}
            >
              <Text style={styles.ctrlText}>Stop</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.ctrlBtn, pressed && styles.pressed]}
            onPress={handleReplay}
          >
            <Text style={[styles.ctrlText, isPaused && styles.ctrlPrimary]}>Replay</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.ctrlBtn, pressed && styles.pressed]}
            onPress={handleSkip}
          >
            <Text style={styles.ctrlText}>Skip</Text>
          </Pressable>
        </View>
      )}

      {/* Floating Ask Loci button */}
      <Pressable
        style={({ pressed }) => [styles.aiFloat, pressed && { opacity: 0.7 }]}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel="Ask Loci"
      >
        <Text style={styles.aiIcon}>◎</Text>
      </Pressable>

      {/* Ask Loci bottom sheet */}
      <Modal transparent visible={showAsk} animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ask Loci</Text>
          <View style={styles.promptList}>
            <Pressable
              style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
              onPress={() => handleAskPrompt("where")}
            >
              <Text style={styles.promptText}>Where am I right now?</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
              onPress={() => handleAskPrompt("what")}
            >
              <Text style={styles.promptText}>What is this space?</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
              onPress={() => handleAskPrompt("next")}
            >
              <Text style={styles.promptText}>Where do I go next?</Text>
            </Pressable>
          </View>

          {/* DEBUG: AI flow visibility */}
          {debugText !== "" && (
            <Text style={styles.debugText}>{debugText}</Text>
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

  // Controls
  controls: {
    flexDirection: "row",
    paddingBottom: 48,
    paddingTop: 8,
    gap: 16,
    alignItems: "center",
  },
  ctrlBtn: {
    paddingVertical: 8,
  },
  ctrlText: {
    color: "#555",
    fontSize: 14,
  },
  ctrlPrimary: {
    color: "#111",
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
  micIcon: {
    color: TEAL,
    fontSize: 20,
  },
  micBtnActive: {
    backgroundColor: "#fff0f0",
    borderColor: "#ff4444",
  },
  micIconActive: {
    color: "#ff4444",
  },
  debugText: {
    fontSize: 12,
    color: "#888",
    marginBottom: 16,
    lineHeight: 18,
    fontFamily: "monospace" as any,
  },
});
