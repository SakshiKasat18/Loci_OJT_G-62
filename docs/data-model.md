# Data Model

---

## Zone Identifiers

Each physical space on the campus has a unique string identifier used consistently across the orchestrator, EventBus, SpeechEngine, and knowledge base.

| ID | Display Name |
|----|-------------|
| `entrance` | Entrance |
| `reception` | Reception |
| `radial_classroom` | Radial Classroom |
| `admin_block` | Admin Block |
| `cafeteria` | Cafeteria |
| `gaming_arcade` | Gaming Arcade |
| `innovation_lab` | Innovation Lab |

Zone IDs are lowercase with underscores. They are the single shared key across all data files.

---

## TOUR_SEQUENCE

The ordered list of zones in the tour. The orchestrator uses this array to determine which zone to prompt for next.

```typescript
const TOUR_SEQUENCE = [
  "entrance",
  "reception",
  "radial_classroom",
  "admin_block",
  "cafeteria",
  "gaming_arcade",
  "innovation_lab",
];
```

The UI zone list must match this array exactly. A mismatch causes Skip navigation and zone prompts to reference different zones.

---

## Zone Scripts

`frontend/core/ZoneScriptMapper.ts`

Each zone has a content object with four fields:

- `label` — display name shown in the UI
- `statusLine` — one-line text shown when the zone activates
- `shortDesc` — short description used in Q&A context
- `segments` — full narration, delivered via TTS

If a zone has no script entry, the SpeechEngine silently skips narration. No error is thrown.

---

## Knowledge Base

`packs/a3_polaris/knowledge.json`

A collection of question-answer pairs, each tagged with a zone:

```json
{
  "zone": "radial_classroom",
  "keywords": ["shape", "design", "seats"],
  "question": "Why is this room shaped like this?",
  "answer": "Every seat has exactly the same view. There is no front row or back row."
}
```

The backend filters entries by zone before scoring. The highest-scoring entry is provided as context to the language model. If no entry matches, a zone-contextual fallback is returned without an LLM call.

---

## WiFi Fingerprints

`packs/a3_polaris/wifi_fingerprints.json`

Reference signal measurements collected on-site for each zone. Used for automatic position detection in a native build. In Expo Go, this module is unavailable and zone detection falls back to the YES/NO confirmation flow.
