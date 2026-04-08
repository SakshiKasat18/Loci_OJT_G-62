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

const FALLBACK = { answer: "I don't have that information.", grounded: false };

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

async function answerQuestion(question, packId) {
  const entries = loadKnowledge(packId);
  const relevant = findRelevantEntries(question, entries);

  // No matching knowledge → fallback immediately, LLM never called
  if (relevant.length === 0) {
    return FALLBACK;
  }

  const context = relevant
    .map((e) => `[${e.topic}]: ${e.content}`)
    .join("\n");

  const userMessage = `Question: ${question}\n\nContext:\n${context}`;

  const completion = await getGroqClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return FALLBACK;
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) return FALLBACK;

  return { answer, grounded: true };
}

module.exports = { answerQuestion };
