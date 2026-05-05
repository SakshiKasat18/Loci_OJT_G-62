# Architecture

LOCI is built as a layered system where each component has a single, well-defined responsibility. Components communicate through a central EventBus rather than calling each other directly.

---

## Layers

### 1. Mobile Layer (React Native / Expo)

The mobile application is the primary interface. It handles:

- Rendering the progress UI and zone status
- Managing the audio recording lifecycle for voice input
- Displaying YES/NO confirmation prompts during zone detection
- Calling the backend AI endpoint for Q&A

The app is built with Expo and runs on Android and iOS. Navigation within the app uses Expo Router.

Key screens:
- `/login` — authentication
- `/guide` — the main experience screen

---

### 2. Spatial Orchestrator (Finite State Machine)

`frontend/services/spatialOrchestrator.ts`

The orchestrator is the authoritative source of navigation state. It runs a 2-second polling loop and transitions between states based on sensor input and user responses.

**States:**

| State | Description |
|-------|-------------|
| `OUTDOOR` | Idle. Waiting for `manualStart()`. |
| `ENTRANCE_LOCKED` | Entrance narration playing. Waiting for audio to complete. |
| `WAITING_FOR_STOP` | Monitoring movement. Waiting for the user to arrive at a new zone. |
| `ASKING_ZONE` | A zone prompt is active. Waiting for YES/NO from the user. |
| `NARRATING` | Zone narration is playing. Waiting for audio to complete. |
| `TOUR_FINISHED` | All zones visited. Terminal state. |

**Transition logic:**

- `ENTRANCE_LOCKED` → `WAITING_FOR_STOP` when TTS finishes.
- `WAITING_FOR_STOP` → `ASKING_ZONE` when the user stops after walking (departure detection) or after 15 seconds of stillness.
- `ASKING_ZONE` → `NARRATING` when the user taps YES.
- `ASKING_ZONE` → `WAITING_FOR_STOP` when the user taps NO (next zone is queued).
- `NARRATING` → `WAITING_FOR_STOP` when TTS finishes.
- `NARRATING` → `TOUR_FINISHED` when the last zone is narrated.

**Cancel safety:**

Every manual user action (Start, Stop, Skip, Replay) increments a `cancelId` counter. All async operations (TTS calls, timers) capture the `cancelId` at start and abort if it has changed by the time they complete. This prevents stale zone prompts from firing after the user has taken a manual action.

**Manual controls:**

- `manualStart()` — always resets to a clean state and starts from entrance.
- `skipToZone(zoneId)` — syncs orchestrator to a zone the UI has skipped to. Resets the 15-second timer.
- `cancelAll()` — cancels all pending work. Sets state to `OUTDOOR`.

---

### 3. EventBus

`frontend/core/EventBus.ts`

A synchronous, in-process pub-sub mechanism. All zone narration is triggered through the EventBus, not by direct function calls between components.

**Event types:**

```typescript
type LociEvent =
  | { type: "ZONE_CHANGED"; zoneId: string; confidence: number }
  | { type: "TOUR_FINISHED" };
```

The orchestrator emits events. The SpeechEngine and the guide UI subscribe to them independently. Subscriber errors are isolated — one failing handler does not block others.

---

### 4. SpeechEngine

`frontend/core/SpeechEngine.ts`

The SpeechEngine subscribes to the EventBus and controls all zone narration TTS. It enforces five sequential gates before any audio plays:

| Gate | Check |
|------|-------|
| 1. Confidence | `confidence >= 0.7` |
| 2. Deduplication | Zone is not the same as the last narrated zone |
| 3. Busy | No TTS is currently active |
| 4. Cooldown | At least 8 seconds since last narration |
| 5. Content | The zone has a non-empty script in ZoneScriptMapper |

If any gate fails, narration is silently skipped. This is the primary enforcement point for the principle "silence over incorrect output."

The SpeechEngine does not control Q&A responses. Those go directly to `expo-speech` through the guide component.

---

### 5. Backend (Node.js / Express)

`backend/src/`

The backend provides two AI endpoints and handles authentication.

- `POST /auth/login` — returns a JWT on valid credentials
- `POST /auth/register` — creates a new user
- `POST /ai/qa` — zone-scoped Q&A (see api.md)
- `POST /ai/intent` — intent classification for voice input

All protected routes require a `Bearer` JWT token in the `Authorization` header. Tokens are verified by `authMiddleware.js`.

All AI calls are logged to the `ai_logs` table in PostgreSQL.

---

### 6. AI Layer (Bounded)

The AI layer uses Groq (llama-3) for language generation. It is bounded in two ways:

1. **Input scoping:** The knowledge base is filtered by `zoneId` before any prompt is constructed. The LLM only receives content relevant to the current zone.
2. **Output isolation:** The AI response is returned as text to the frontend. It has no access to navigation state and cannot modify the orchestrator.

If the knowledge base has no relevant entry for the question, `qaService.js` constructs a zone-contextual fallback response without calling the LLM.

---

### 7. Data Layer

**Database:** PostgreSQL (Neon serverless)

Tables:
- `users` — id, email, password_hash, created_at
- `ai_logs` — id, user_id, question, response, zone, created_at

**Local data files:**

- `frontend/data/zones.ts` — WiFi fingerprints per zone (for future WiFi-based positioning)
- `frontend/core/ZoneScriptMapper.ts` — narration scripts per zone
- `packs/a3_polaris/knowledge.json` — Q&A knowledge base, keyed by zone
- `packs/a3_polaris/graph.json` — campus adjacency data (future routing)

---

## Communication Flow

```
User arrives at zone
        |
IMU detects stillness after movement
        |
SpatialOrchestrator: WAITING_FOR_STOP → ASKING_ZONE
        |
TTSController speaks: "Are you near the [zone]?"
        |
User taps YES
        |
handleResponse(true) → triggerNarration()
        |
EventBus.emit({ type: "ZONE_CHANGED", zoneId, confidence: 1 })
        |
SpeechEngine.handle()
        |-- Gate 1: confidence check
        |-- Gate 2: dedup check
        |-- Gate 3: busy check
        |-- Gate 4: cooldown check
        |-- Gate 5: content check
        |
ZoneScriptMapper.getZoneScript(zoneId)
        |
expo-speech.speak(script)
        |
SpatialOrchestrator: NARRATING → WAITING_FOR_STOP
```
