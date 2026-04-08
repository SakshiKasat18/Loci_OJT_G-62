const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { extractIntent } = require("../services/intentService");
const { answerQuestion } = require("../services/qaService");
const { pool } = require("../db");

// Non-fatal logging — never kills the main response
async function logAiRequest(type, packId, input, response) {
  try {
    await pool.query(
      "INSERT INTO ai_logs (request_type, pack_id, input_text, response_json) VALUES ($1, $2, $3, $4)",
      [type, packId || "unknown", input, JSON.stringify(response)]
    );
  } catch (err) {
    console.warn("[ai_logs] logging skipped:", err.message);
  }
}

// POST /ai/intent
router.post("/intent", requireAuth, async (req, res) => {
  const { text, pack_id } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const result = await extractIntent(text);
    logAiRequest("intent", pack_id, text, result); // fire-and-forget
    return res.json(result);
  } catch (err) {
    console.error("[/ai/intent] error:", err.message);
    return res.status(500).json({ error: "intent extraction failed" });
  }
});

// POST /ai/qa
router.post("/qa", requireAuth, async (req, res) => {
  const { question, pack_id } = req.body || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question is required" });
  }

  try {
    const result = await answerQuestion(question, pack_id || "a3_polaris");
    logAiRequest("qa", pack_id, question, result); // fire-and-forget
    return res.json(result);
  } catch (err) {
    console.error("[/ai/qa] error:", err.message);
    return res.status(500).json({ error: "qa failed" });
  }
});

module.exports = router;
