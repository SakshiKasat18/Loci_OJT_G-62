# LOCI — Audio-First Spatial Guidance System

A deterministic, audio-first indoor guidance system designed for reliable navigation in uncertain environments.

---

## Problem

Visitors navigating unfamiliar indoor spaces rely on static signage or printed maps that require active attention and offer no contextual awareness. First-time visitors to a campus frequently lose orientation, miss key spaces, and have no way to ask questions about what they are seeing.

## Solution

LOCI guides visitors through a campus using spatial audio narration and voice-based Q&A. The system detects where the user is, narrates each zone, and responds to spoken questions — all without requiring the user to look at a screen.

Navigation is controlled by a finite state machine. Audio is the primary interface. AI is used only for natural language understanding, never for navigation decisions.

---

## Design Principles

**Silence over incorrect output.**
The system will not speak unless it has verified content for the current zone. Uncertain or missing data produces silence, not hallucination.

**Deterministic navigation.**
Zone transitions follow a fixed sequence. The orchestrator does not use probabilistic inference for routing decisions.

**Bounded AI.**
The language model is scoped to a zone-specific knowledge base. It cannot affect the navigation state. It answers questions; it does not direct movement.

---

## Architecture Overview

```
Mobile App (React Native / Expo)
    |
    |-- SpatialOrchestrator (FSM)
    |       |-- Sensor loop (GPS, IMU)
    |       |-- State machine (OUTDOOR → NARRATING → TOUR_FINISHED)
    |
    |-- EventBus (pub-sub)
    |       |-- ZONE_CHANGED
    |       |-- TOUR_FINISHED
    |
    |-- SpeechEngine (5-gate TTS pipeline)
    |       |-- Confidence gate
    |       |-- Deduplication gate
    |       |-- Busy gate
    |       |-- Cooldown gate
    |       |-- Content gate
    |
    |-- Voice Q&A
            |-- Deepgram (STT)
            |-- Backend API (Node.js / Express)
            |-- Groq LLM (zone-scoped)

Backend (Node.js)
    |-- /ai/qa     — zone-scoped Q&A
    |-- /ai/intent — intent classification
    |-- PostgreSQL (Neon) — auth, logs
```

AI is strictly limited to language understanding and cannot influence navigation decisions.

---

## Demo Flow

1. User opens the app and logs in.
2. Tap **Start Experience** — entrance narration plays.
3. System waits for movement, then asks zone confirmation via YES/NO.
4. User confirms zone — narration plays for that zone.
5. User taps **Ask Loci** and speaks a question — AI responds via TTS.
6. User taps **Skip** to advance, **Replay** to repeat, **Stop** to pause.
7. Tour ends when all zones are visited.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native (Expo) |
| Language | TypeScript |
| Navigation | Custom FSM (SpatialOrchestrator) |
| Communication | EventBus (pub-sub) |
| TTS | expo-speech |
| STT | Deepgram nova-2 |
| Audio recording | expo-av |
| Motion detection | expo-sensors (accelerometer) |
| Backend | Node.js, Express |
| AI | Groq (llama-3) |
| Database | PostgreSQL (Neon) |
| Auth | JWT, bcrypt |
| Tunneling | ngrok |

---

## Setup

### Prerequisites

- Node.js 18+
- Expo Go (Android or iOS)
- ngrok account

### Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in GROQ_API_KEY, DATABASE_URL, JWT_SECRET
npm run dev
```

### Tunnel

```bash
ngrok http 8080
# copy the https URL into frontend/constants/api.ts → API_BASE_URL
```

### Frontend

```bash
cd frontend
npm install
npx expo start
# scan QR code in Expo Go
```

---

## Team

Sakshi Kasat  
Manav Nayak
