/**
 * onboarding.tsx
 *
 * Cinematic LOCI onboarding — narrative framing before the indoor guide.
 *
 * Flow:
 *  IDLE      → tap "Ask LOCI"
 *  LISTENING → 3s auto-listen window for "Hey LOCI" / any phrase
 *              (falls through after 3s if no speech detected)
 *  SPEAKING  → LOCI responds with grounded location context
 *  AWAITING  → transition prompt + auto-listen + "Continue" button
 *  HOLDING   → presenter holding state — "Begin" button visible
 *  ENTERING  → 1s calm pause → manualStart() → /guide
 */

import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  Animated,
  Platform,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";

import { spatialOrchestrator } from "../services/spatialOrchestrator";

// ─── Constants ────────────────────────────────────────────────────────────────

// Softened palette — same hue as guide.tsx, lower saturation and shadow intensity
const TEAL     = "#2dd4aa";   // exact match to guide.tsx
const TEAL_DIM = "#1aab86";
const TEAL_BG  = "rgba(45, 212, 170, 0.08)";

const DG_API_KEY = process.env.EXPO_PUBLIC_DG_API_KEY ?? "";

// ── TTS lines ────────────────────────────────────────────────────────────────
// Phonetic "Divya Shree" for natural TTS pronunciation.
// Visual text in footer still uses "Divyasree".

const TTS_INTRO =
  "You're currently inside Divya Shree Tech Park, near the A3 tower that houses Polaris School of Technology, a new-generation tech college.";

const TTS_TRANSITION =
  "Would you like me to guide you indoors through the campus experience?";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"      // tap target visible
  | "listening" // initial listen window (3s) — waiting for user phrase
  | "speaking"  // LOCI narrating
  | "awaiting"  // transition prompt done — listening for yes + Continue button
  | "holding"   // presenter holding state — begin button visible
  | "entering"; // 1s pause before navigating to /guide

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function transcribeShort(uri: string): Promise<string> {
  if (!DG_API_KEY) return "";
  try {
    const fileRes = await fetch(uri);
    const blob    = await fileRes.blob();
    const buffer  = await new Response(blob).arrayBuffer();
    const dgRes   = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=false",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DG_API_KEY}`,
          "Content-Type": "audio/m4a",
        },
        body: new Uint8Array(buffer),
      }
    );
    if (!dgRes.ok) return "";
    const json = await dgRes.json();
    return (
      json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ""
    ).toLowerCase().trim();
  } catch {
    return "";
  }
}

function hasYesIntent(t: string) {
  return (
    t.includes("yes") || t.includes("yeah") ||
    t.includes("sure") || t.includes("okay") ||
    t.includes("ok") || t.includes("go ahead")
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [phase, setPhase] = useState<Phase>("idle");

  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);

  // Recording state
  const recordingRef   = useRef<Audio.Recording | null>(null);
  const isStoppingRef  = useRef(false);
  const listenTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);

  // ── Pulse helpers ─────────────────────────────────────────────────────────

  const startPulse = useCallback((speed: number = 1600) => {
    pulseRef.current?.stop();
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.09, duration: speed,       useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: speed,       useNativeDriver: true }),
      ])
    );
    pulseRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseRef.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // ── Recording lifecycle ───────────────────────────────────────────────────

  const safeStopRecording = useCallback(async (): Promise<string | null> => {
    const rec = recordingRef.current;
    if (!rec || isStoppingRef.current) return null;
    isStoppingRef.current = true;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      return uri ?? null;
    } catch {
      recordingRef.current = null;
      return null;
    } finally {
      isStoppingRef.current = false;
    }
  }, []);

  const releaseAudio = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  const cancelListen = useCallback(async () => {
    if (listenTimer.current) { clearTimeout(listenTimer.current); listenTimer.current = null; }
    await safeStopRecording();
    await releaseAudio();
  }, [safeStopRecording, releaseAudio]);

  // ── Generic listen window ─────────────────────────────────────────────────
  // Starts recording for `windowMs`, transcribes, calls onResult.
  // onResult receives transcript (may be empty on silence/timeout).

  const openListenWindow = useCallback(
    async (windowMs: number, onResult: (transcript: string) => void) => {
      if (!mountedRef.current) return;
      try {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        isStoppingRef.current = false;
        console.log(`[ONBOARDING] Listen window opened — ${windowMs}ms.`);

        listenTimer.current = setTimeout(async () => {
          if (!mountedRef.current) return;
          const uri = await safeStopRecording();
          await releaseAudio();
          if (uri) {
            const t = await transcribeShort(uri);
            console.log(`[ONBOARDING] Transcript: "${t}"`);
            if (mountedRef.current) onResult(t);
          } else {
            if (mountedRef.current) onResult("");
          }
        }, windowMs);
      } catch (err) {
        console.warn("[ONBOARDING] openListenWindow failed:", err);
        if (mountedRef.current) onResult("");
      }
    },
    [safeStopRecording, releaseAudio]
  );

  // ── Speak helper ─────────────────────────────────────────────────────────

  const speakLine = useCallback((text: string, onDone: () => void) => {
    Speech.stop();
    Speech.speak(text, { rate: 0.80, onDone, onError: onDone });
  }, []);

  // ── Phase: IDLE → tap orb ─────────────────────────────────────────────────

  const handleAskLoci = useCallback(() => {
    if (phase !== "idle") return;

    // Enter LISTENING — open 3s window before speaking
    setPhase("listening");
    startPulse(1200); // slightly faster pulse to indicate listening

    openListenWindow(3000, (transcript) => {
      if (!mountedRef.current) return;
      // Any speech at all triggers the response.
      // Silence (empty transcript) also falls through naturally.
      console.log(`[ONBOARDING] Initial phrase: "${transcript}" — proceeding to response.`);

      setPhase("speaking");
      startPulse(1800); // slower pulse during narration

      // Small beat before speaking — feels intentional
      setTimeout(() => {
        if (!mountedRef.current) return;

        speakLine(TTS_INTRO, () => {
          if (!mountedRef.current) return;

          // Natural breath between sentences
          setTimeout(() => {
            if (!mountedRef.current) return;

            speakLine(TTS_TRANSITION, () => {
              if (!mountedRef.current) return;
              setPhase("awaiting");
              stopPulse();

              // Open 3s listen window for "yes" response
              openListenWindow(3000, (t) => {
                if (!mountedRef.current) return;
                if (hasYesIntent(t)) {
                  console.log("[ONBOARDING] Yes intent — holding state.");
                  setPhase("holding");
                }
                // If no yes, user must tap "Continue" manually
              });
            });
          }, 700);
        });
      }, 400);
    });
  }, [phase, startPulse, stopPulse, speakLine, openListenWindow]);

  // ── Phase: AWAITING → Continue tap ───────────────────────────────────────

  const handleContinue = useCallback(async () => {
    if (phase !== "awaiting") return;
    Speech.stop();
    await cancelListen();
    setPhase("holding");
  }, [phase, cancelListen]);

  // ── Phase: HOLDING → Begin ────────────────────────────────────────────────

  const handleBegin = useCallback(async () => {
    if (phase !== "holding") return;
    console.log("[ONBOARDING] manualStart triggered.");
    setPhase("entering");
    startPulse(1200);

    await wait(1000); // emotional beat
    if (!mountedRef.current) return;

    await spatialOrchestrator.manualStart();
    console.log("[ONBOARDING] Orchestrator started at entrance.");

    stopPulse();
    router.replace("/guide");
  }, [phase, startPulse, stopPulse]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Speech.stop();
      if (listenTimer.current) clearTimeout(listenTimer.current);
      safeStopRecording();
      stopPulse();
    };
  }, [safeStopRecording, stopPulse]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Brand */}
      <View style={styles.topRow}>
        <Text style={styles.brandText}>LOCI</Text>
      </View>

      {/* Orb */}
      <View style={styles.orbArea}>
        <Animated.View
          style={[styles.orbOuter, { transform: [{ scale: pulseAnim }] }]}
        >
          <View style={styles.orbInner}>
            {phase === "idle" && (
              <Pressable onPress={handleAskLoci} style={styles.orbPressable}>
                <Text style={styles.orbLabel}>Ask{"\n"}LOCI</Text>
              </Pressable>
            )}
            {phase === "listening" && (
              <View style={styles.orbPressable}>
                <Text style={styles.orbGlyph}>◉</Text>
              </View>
            )}
            {phase === "speaking" && (
              <View style={styles.orbPressable}>
                <Text style={styles.orbGlyph}>◈</Text>
              </View>
            )}
            {phase === "awaiting" && (
              <View style={styles.orbPressable}>
                <Text style={styles.orbGlyph}>◉</Text>
              </View>
            )}
            {phase === "holding" && (
              <View style={styles.orbPressable}>
                <Text style={styles.orbGlyph}>✦</Text>
              </View>
            )}
            {phase === "entering" && (
              <View style={styles.orbPressable}>
                <Text style={styles.orbGlyph}>◈</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Status line */}
        <View style={styles.statusArea}>
          {phase === "idle"      && <Text style={styles.hintText}></Text>}
          {phase === "listening" && <Text style={styles.activeText}>Listening...</Text>}
          {phase === "speaking"  && <Text style={styles.activeText}></Text>}
          {phase === "awaiting"  && <Text style={styles.activeText}>Say "yes" or tap Continue</Text>}
          {phase === "holding"   && <Text style={styles.readyText}>Ready when you are.</Text>}
          {phase === "entering"  && <Text style={styles.activeText}></Text>}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionArea}>
        {phase === "awaiting" && (
          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnText}>Continue</Text>
          </Pressable>
        )}

        {phase === "holding" && (
          <Pressable
            onPress={handleBegin}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnText}>Begin Guided Experience</Text>
          </Pressable>
        )}
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "android" ? 52 : 64,
    paddingBottom: 40,
    paddingHorizontal: 32,
  },

  // Brand — no subtitle
  topRow: { alignItems: "center" },
  brandText: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 8,
    color: "#1a1a1a",
    fontFamily: Platform.OS === "ios" ? "SF Pro Display" : "sans-serif-medium",
  },

  // Orb — softer palette
  orbArea: { alignItems: "center", gap: 24 },
  orbOuter: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: TEAL_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  orbInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    // Softer shadow — less aggressive glow
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30,
    shadowRadius: 18,
    elevation: 8,
  },
  orbPressable: {
    width: "100%",
    height: "100%",
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  orbLabel: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.5,
    textAlign: "center",
    lineHeight: 23,
  },
  orbGlyph: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 30,
  },

  // Status
  statusArea: { alignItems: "center", minHeight: 20 },
  hintText:   { fontSize: 13, color: "#cccccc", letterSpacing: 0.3 },
  activeText: { fontSize: 13, color: "#999999", letterSpacing: 0.3 },
  readyText:  { fontSize: 13, color: TEAL_DIM,  letterSpacing: 0.3, fontWeight: "500" },

  // Buttons
  actionArea: {
    width: "100%",
    alignItems: "center",
    minHeight: 80,
    justifyContent: "flex-end",
  },
  btn: {
    backgroundColor: TEAL,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  btnPressed: {
    backgroundColor: TEAL_DIM,
    shadowOpacity: 0.07,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // Footer
  footer:      { display: "none" },
  footerText:  { display: "none" },
  footerSep:   { display: "none" },
});
