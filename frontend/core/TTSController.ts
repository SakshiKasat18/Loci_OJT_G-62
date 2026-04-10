/**
 * TTSController — Isolated Text-To-Speech controller.
 *
 * This is the ONLY module allowed to call expo-speech.
 * SpeechEngine delegates here. The UI never calls this directly.
 *
 * If you later swap expo-speech for a different TTS engine (native, cloud, etc),
 * only this file changes — everything above it stays the same.
 */

import * as Speech from "expo-speech";

// ─────────────────────────────────────────────────────────────────────────────
// TTSController Class
// ─────────────────────────────────────────────────────────────────────────────

class TTSController {
  /**
   * Speak the given text aloud.
   * Resolves when speech is complete or errored.
   * Caller must check isSpeaking() before calling to prevent overlap.
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: "en-IN", // Indian English — matches the Polaris campus context
        pitch: 1.0,
        rate: 0.92, // Slightly slower than default for clarity in ambient environments
        onDone: () => resolve(),
        onError: (err) => {
          console.error("[TTSController] Speech error:", err);
          resolve(); // Resolve (not reject) — SpeechEngine must always regain control
        },
        onStopped: () => resolve(), // Manually stopped via stop()
      });
    });
  }

  /**
   * Immediately stop any ongoing speech.
   * Safe to call even when nothing is playing.
   */
  stop(): void {
    Speech.stop();
  }

  /**
   * Check whether TTS is currently active.
   * Wraps the async expo-speech check.
   */
  isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export — one controller for the entire app
// ─────────────────────────────────────────────────────────────────────────────

export const ttsController = new TTSController();
