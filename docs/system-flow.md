# System Flow

---

## Flow 1: Movement to Narration

This is the primary navigation flow. It runs automatically after the user starts the tour.

```
User taps "Start Experience"
        |
spatialOrchestrator.manualStart()
        |
hardReset() — clears all state
        |
transitionToEntrance()
        |-- currentZone = "entrance"
        |-- visitedZones.add("entrance")
        |-- setState("ENTRANCE_LOCKED")
        |-- EventBus.emit({ type: "ZONE_CHANGED", zoneId: "entrance", confidence: 0.8 })
        |
SpeechEngine receives ZONE_CHANGED
        |-- Gate 1: confidence 0.8 >= 0.7 — pass
        |-- Gate 2: not duplicate — pass
        |-- Gate 3: not busy — pass
        |-- Gate 4: cooldown elapsed — pass
        |-- Gate 5: script exists — pass
        |
expo-speech plays entrance narration
        |
SpatialOrchestrator loop (every 2s): isSpeaking() = false
        |
setState("WAITING_FOR_STOP")
```

**Departure detected (user walks):**

```
IMU: isMoving = true
        |
departureDetected = true
lastWalkingTime = Date.now()
        |
IMU: isMoving = false
        |
now - lastWalkingTime > 3000ms (3 seconds still)
        |
setState("ASKING_ZONE")
        |
askNextZone()
        |
TOUR_SEQUENCE.find(z => !visitedZones.has(z))  → "reception"
        |
TTSController.speak("Are you near the reception?")
```

**15-second fallback (user stands still):**

```
now - lastStableTime > 15000ms
        |
setState("ASKING_ZONE")
        |
askNextZone() — same as above
```

**User taps YES:**

```
handleResponse(true)
        |
currentZone = pendingZone
        |
triggerNarration()
        |-- visitedZones.add(currentZone)
        |-- setState("NARRATING")
        |-- EventBus.emit({ type: "ZONE_CHANGED", zoneId, confidence: 1 })
        |
SpeechEngine plays zone narration
        |
isSpeaking() = false
        |
setState("WAITING_FOR_STOP")
        |
[cycle repeats for next zone]
```

**User taps NO:**

```
handleResponse(false)
        |
visitedZones.add(pendingZone)   // skip this zone in sequence
        |
setState("WAITING_FOR_STOP")
lastStableTime = Date.now() - 16000  // backdate: triggers immediately next cycle
        |
2 seconds later: 15s check fires
        |
askNextZone() — asks about next unvisited zone
```

**Tour completion:**

```
triggerNarration("innovation_lab")
        |
visitedZones.has all TOUR_SEQUENCE zones
        |
setTimeout 500ms (cancelId-guarded)
        |
setState("TOUR_FINISHED")
EventBus.emit({ type: "TOUR_FINISHED" })
        |
guide.tsx: setState("done")
crossFadeText("The tour has ended.")
```

---

## Flow 2: Voice Q&A

This flow runs independently of navigation. It does not modify orchestrator state.

```
User taps microphone button in guide.tsx
        |
Audio.setAudioModeAsync({ allowsRecordingIOS: false → true })
        |
Audio.Recording.createAsync(RECORDING_OPTIONS_PRESET_HIGH_QUALITY)
        |
[user speaks — recording active]
        |
User releases mic button (or 8s auto-stop)
        |
recording.stopAndUnloadAsync()
        |
fileUri = recording.getURI()
        |
FormData: append audio file (m4a)
        |
HTTP POST → Deepgram API (nova-2 model)
        |
Response: { transcript, confidence }
        |
if confidence < 0.7: abort, show "Could not understand"
        |
transcript = "Where am I right now?"
        |
HTTP POST → /ai/qa
{
  question: transcript,
  zone: currentZoneId,       // from orchestrator
  pack_id: "a3_polaris"
}
        |
Backend: qaService.answerQuestion(question, packId, zone)
        |
Filter knowledge.json by zone
        |
Score entries by keyword overlap
        |
if match found:
    build LLM prompt with context
    Groq API call
    return answer
else:
    return fallback: "You're currently in the [zone name]."
        |
Response: { answer: "You're currently in the radial classroom." }
        |
Frontend: isBadResponse check
        |
expo-speech.speak(answer)
        |
UI: isThinking = false, answer displayed
```

---

## Cancel Safety

Every manual user action calls `this.cancelId++` in the orchestrator. Async functions capture the `cancelId` value at the point they start:

```typescript
private async askNextZone() {
  const capturedCancel = this.cancelId;

  await ttsController.speak("Are you near the reception?");

  if (this.cancelId !== capturedCancel) return; // aborted
}
```

If the user taps Stop or Skip during the TTS call, `cancelId` increments. After `speak()` resolves, the function checks the captured value and exits without continuing. This prevents stale zone prompts from appearing after manual overrides.

The same pattern guards the `setTimeout` inside `triggerNarration()` that emits `TOUR_FINISHED`.
