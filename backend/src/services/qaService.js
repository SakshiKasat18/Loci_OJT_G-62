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

// Always returns a meaningful answer — never "I don't have that information"
function buildFallback(question, zone) {
  const hasZone = zone && typeof zone === "string";
  const zoneName = hasZone ? zone.replace(/_/g, " ") : null;
  const q = (question || "").toLowerCase();
  let answer;
  if (q.includes("next") || q.includes("go")) {
    answer = "You can move to the next section ahead.";
  } else if (q.includes("where")) {
    answer = zoneName ? `You're currently in the ${zoneName}.` : "You're currently in this area.";
  } else if (q.includes("what")) {
    answer = zoneName ? `This is the ${zoneName}.` : "This is the current area.";
  } else {
    answer = zoneName ? `You're currently near the ${zoneName}.` : "You're currently in this area.";
  }
  return { answer, grounded: false };
}

function loadKnowledge(packId) {
  const knowledgePath = path.join(
    __dirname,
    "../../../packs",
    packId,
    "knowledge.json"
  );
  if (!fs.existsSync(knowledgePath)) return [];
  const raw = fs.readFileSync(knowledgePath, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.entries || [];
}

function findRelevantEntries(question, entries) {
  const words = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  return entries.filter((entry) => {
    const haystack = `${entry.topic} ${entry.content}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
}

async function answerQuestion(question, packId, zone) {
  const entries = loadKnowledge(packId);

  // Zone pre-filter: narrow entries to those whose topic mentions the zone.
  let pool = entries;
  if (zone && typeof zone === "string") {
    const zoneWords = zone.toLowerCase().replace(/_/g, " ").split(/\s+/).filter(Boolean);
    const zoneFiltered = entries.filter((entry) => {
      const topic = (entry.topic || "").toLowerCase();
      return zoneWords.some((w) => topic.includes(w));
    });
    if (zoneFiltered.length > 0) pool = zoneFiltered;
  }

  const relevant = findRelevantEntries(question, pool);

  // No keyword match → zone-aware fallback immediately
  if (relevant.length === 0) {
    return buildFallback(question, zone);
  }

  const context = relevant
    .map((e) => `[${e.topic}]: ${e.content}`)
    .join("\n");

  const userMessage = `Question: ${question}\n\nContext:\n${context}`;

  let raw = "{}";
  try {
    const completion = await getGroqClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });
    raw = completion.choices[0]?.message?.content || "{}";
  } catch (llmErr) {
    console.warn("[qaService] LLM call failed:", llmErr.message);
    return buildFallback(question, zone);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return buildFallback(question, zone);
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) return buildFallback(question, zone);

  return { answer, grounded: true };
}

module.exports = { answerQuestion };
