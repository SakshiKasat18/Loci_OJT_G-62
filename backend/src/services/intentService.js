const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");

function getGroqClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "../prompts/intent.txt"),
  "utf-8"
);

const ALLOWED_INTENTS = ["navigate", "query", "unknown"];

async function extractIntent(text) {
  const completion = await getGroqClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { intent: "unknown", destination: null, confidence: 0 };
  }

  // Validate — reject if intent is not in allowed set
  if (!ALLOWED_INTENTS.includes(parsed.intent)) {
    return { intent: "unknown", destination: null, confidence: 0 };
  }

  return {
    intent: parsed.intent,
    destination: parsed.destination || null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

module.exports = { extractIntent };
