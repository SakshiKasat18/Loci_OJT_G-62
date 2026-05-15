const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");

function getGroqClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "../prompts/qa.txt"),
  "utf-8"
);

// ── Knowledge Loading ──────────────────────────────────────────────────────

function loadEntries(packId) {
  const knowledgePath = path.join(
    __dirname,
    "../../../packs",
    packId,
    "knowledge.json"
  );
  if (!fs.existsSync(knowledgePath)) {
    console.warn(`[QA] knowledge.json not found for pack: ${packId}`);
    return [];
  }
  try {
    const raw = fs.readFileSync(knowledgePath, "utf-8");
    return JSON.parse(raw).entries || [];
  } catch (err) {
    console.warn("[QA] Failed to parse knowledge.json:", err.message);
    return [];
  }
}

// ── Context Retrieval ──────────────────────────────────────────────────────
// Deterministic lookup by zone_id — no keyword filtering, no fragile heuristics.

function getEntryByZone(entries, zoneId) {
  if (!zoneId || !entries.length) return null;
  return entries.find((e) => e.zone_id === zoneId) || null;
}

// ── Context Block Builder ──────────────────────────────────────────────────
// Formats a structured, readable context block from a knowledge entry.

function buildContextBlock(entry, role) {
  if (!entry) return null;
  const lines = [`[${role}: ${entry.label}]`];
  if (entry.identity)          lines.push(`  Identity: ${entry.identity}`);
  if (entry.purpose)           lines.push(`  Purpose: ${entry.purpose}`);
  if (entry.atmosphere)        lines.push(`  Atmosphere: ${entry.atmosphere}`);
  if (entry.symbolism)         lines.push(`  Symbolism: ${entry.symbolism}`);
  if (entry.experience_script) lines.push(`  Narration spoken here: ${entry.experience_script}`);
  return lines.join("\n");
}

// ── Hard Fallback ──────────────────────────────────────────────────────────
// Only used when the LLM call itself fails (network error, API down).
// The LLM handles graceful uncertainty for content gaps — this is a last resort.

function buildHardFallback(currentZone) {
  const zoneName = currentZone ? currentZone.replace(/_/g, " ") : "this area";
  return {
    answer: `Feel free to ask about the spaces around you — I'm here to guide you through ${zoneName} and what it was designed for.`,
    grounded: false,
  };
}

// ── Main Entry Point ───────────────────────────────────────────────────────

async function answerQuestion(question, packId, currentZone, previousZone, nextZone) {
  console.log(`[QA] ─────────────────────────────────────`);
  console.log(`[QA] Question: "${question}"`);
  console.log(`[QA] Context: current=${currentZone} | prev=${previousZone || "none"} | next=${nextZone || "none"}`);

  const entries = loadEntries(packId);

  // Always resolve entries by exact zone_id — no brittle filtering
  const currentEntry = getEntryByZone(entries, currentZone);
  const nextEntry    = getEntryByZone(entries, nextZone);
  const prevEntry    = getEntryByZone(entries, previousZone);
  const campusEntry  = getEntryByZone(entries, "polaris_campus");

  // Log what was found
  console.log(`[QA] Zone context: ${currentEntry ? `LOADED (${currentEntry.label})` : `NOT FOUND for zone_id="${currentZone}"`}`);
  if (nextEntry)    console.log(`[QA] Next zone context: LOADED (${nextEntry.label})`);
  if (campusEntry)  console.log(`[QA] Campus context: LOADED`);

  // ── Assemble Context Blocks ──────────────────────────────────────────────
  const contextBlocks = [];

  // 1. Current zone — always primary, always injected
  if (currentEntry) {
    contextBlocks.push(buildContextBlock(currentEntry, "Current Space"));
  } else {
    // Zone exists in tour but not in knowledge — inject minimal grounding
    const fallbackLabel = currentZone ? currentZone.replace(/_/g, " ") : "unknown area";
    contextBlocks.push(`[Current Space]: ${fallbackLabel} (detailed context not yet available)`);
    console.warn(`[QA] WARNING: No knowledge entry found for zone_id="${currentZone}" — injecting label only`);
  }

  // 2. Previous zone — label only, for context continuity
  if (prevEntry) {
    contextBlocks.push(`[Previously visited]: ${prevEntry.label}`);
  }

  // 3. Next zone — identity only, sufficient for "where next" answers
  if (nextEntry) {
    const nextLines = [`[Next Space — coming up]: ${nextEntry.label}`];
    if (nextEntry.identity) nextLines.push(`  ${nextEntry.identity}`);
    contextBlocks.push(nextLines.join("\n"));
  } else if (nextZone) {
    // next_zone provided but no knowledge entry — inject label at minimum
    contextBlocks.push(`[Next Space — coming up]: ${nextZone.replace(/_/g, " ")}`);
  }

  // 4. Campus philosophy — always appended for high-level questions
  if (campusEntry) {
    const campusLines = [`[Campus Philosophy: ${campusEntry.label}]`];
    if (campusEntry.identity)  campusLines.push(`  ${campusEntry.identity}`);
    if (campusEntry.symbolism) campusLines.push(`  ${campusEntry.symbolism}`);
    contextBlocks.push(campusLines.join("\n"));
  }

  const contextString = contextBlocks.join("\n\n");
  const userMessage   = `Question: ${question}\n\nContext:\n${contextString}`;

  console.log(`[QA] Prompt assembled — ${contextBlocks.length} context block(s). Sending to Groq...`);
  console.log(`[QA] === EXACT PROMPT SENT ===\n${userMessage}\n==============================`);

  // ── LLM Call ──────────────────────────────────────────────────────────────
  let raw = "{}";
  try {
    const completion = await getGroqClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage   },
      ],
    });
    raw = completion.choices[0]?.message?.content || "{}";
    console.log(`[QA] Raw LLM response: ${raw}`);
  } catch (llmErr) {
    console.warn("[QA] LLM call failed:", llmErr.message);
    console.log("[QA] FALLBACK triggered: LLM unreachable");
    return buildHardFallback(currentZone);
  }

  // ── Parse & Validate ──────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[QA] FALLBACK triggered: JSON parse failed");
    return buildHardFallback(currentZone);
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) {
    console.warn("[QA] FALLBACK triggered: empty answer field");
    return buildHardFallback(currentZone);
  }

  console.log(`[QA] Final answer: "${answer}"`);
  console.log(`[QA] ─────────────────────────────────────`);
  return { answer, grounded: true };
}

module.exports = { answerQuestion };
