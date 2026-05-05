# Demo Guide

---

## Recommended Flow

1. Open the app and log in.
2. Tap **Start Experience** — entrance narration plays.
3. Wait for the zone prompt: *"Are you near the reception?"*
4. Tap **YES** — reception narration plays.
5. Tap the microphone and ask:
   - "What is this space?"
   - "Where am I right now?"
   - "Where should I go next?"
6. Tap **Skip** to advance to the next zone.
7. Tap **Stop** when done.

Stop the demo at zone 3 or 4. Do not complete the full tour during a first presentation.

---

## Controls

| Button | Action |
|--------|--------|
| Start Experience | Resets tour, plays entrance narration |
| YES | Confirms current zone, plays narration |
| NO | Skips suggested zone, asks next |
| Skip | Advances to next zone directly |
| Replay | Repeats current zone narration |
| Stop | Silences system completely |
| Ask Loci | Opens voice Q&A for current zone |

---

## Safe Questions for Voice Q&A

These consistently produce clean responses:

- "Where am I right now?"
- "What is this space?"
- "What is this place used for?"
- "Where should I go next?"

---

## What to Avoid

- Do not tap NO repeatedly without purpose.
- Do not complete the full tour (all 7 zones) unless demonstrating tour completion specifically.
- Do not ask questions about zones the user has not yet visited.

---

## Fallback Lines

If the AI response is slow:

> "The system uses Deepgram for speech recognition and Groq for language generation. Both run over the network."

If narration does not play:

> "The SpeechEngine has five verification gates before any audio plays. If any gate fails, the system stays silent rather than produce incorrect output. This is by design."

If a zone prompt fires unexpectedly:

> "The system detected 15 seconds of stillness and prompted for the next zone. This is the hands-free detection mechanism."

If the app needs a reset:

> Tap **Stop**, then **Start Experience**. The system always resets to the entrance.
