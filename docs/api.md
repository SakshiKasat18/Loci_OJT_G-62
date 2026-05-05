# API Reference

Base URL: configured per deployment via ngrok or production host.

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

## POST /ai/qa

Answers a spoken or typed question about the current zone.

The response is always a complete, natural-language sentence suitable for text-to-speech output.

### Request

```json
{
  "question": "What is this space used for?",
  "zone": "radial_classroom",
  "pack_id": "a3_polaris"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The user's question as transcribed by Deepgram |
| `zone` | string | Yes | The current zone ID from the orchestrator |
| `pack_id` | string | No | Knowledge pack identifier. Defaults to `a3_polaris`. |

### Response

```json
{
  "answer": "The Radial Classroom is a semi-circular space designed so every seat has an equal view.",
  "zone": "radial_classroom",
  "matched": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `answer` | string | The response text, ready for TTS |
| `zone` | string | The zone the response was generated for |
| `matched` | boolean | Whether a knowledge base entry was found for the question |

### Fallback Behavior

The system has two fallback layers:

**Backend fallback (`qaService.js`):**
If no knowledge entry matches the question, or if the LLM call fails, the service constructs a zone-contextual response:

```
"You're currently in the [zone name]. Feel free to explore this space."
```

This fallback fires for all error conditions: no match, empty response, JSON parse error, network error. The frontend never receives an empty or generic failure string.

**Frontend fallback (`guide.tsx`):**
If the backend response is empty, undefined, or contains known failure phrases (`"don't have"`, `"not available"`), the frontend constructs a local fallback before calling TTS:

```
"You're currently in the [zone name]."
```

This ensures TTS always has valid input.

### Constraints

- The AI response has no access to navigation state.
- The AI cannot trigger zone transitions, emit EventBus events, or modify the orchestrator.
- The AI response is advisory only and has no effect on system state or navigation flow.
- The `zone` field in the request is set by the frontend from the orchestrator's `currentZone`. It is not user-supplied.
- Response latency is typically 1.5–3 seconds (Deepgram STT + Groq LLM).

---

## POST /ai/intent

Classifies the intent of a user's spoken input.

Used internally. Not called from the Q&A flow.

### Request

```json
{
  "text": "Take me to the cafeteria"
}
```

### Response

```json
{
  "intent": "navigate",
  "destination": "cafeteria"
}
```

---

## POST /auth/register

```json
{
  "email": "user@example.com",
  "password": "plaintext"
}
```

Returns `201` with a JWT on success.

---

## POST /auth/login

```json
{
  "email": "user@example.com",
  "password": "plaintext"
}
```

Returns `200` with:

```json
{
  "token": "<jwt>"
}
```

Store the token in `AsyncStorage` and include it in all subsequent requests.
