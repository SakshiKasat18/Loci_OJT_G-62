const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT pack_id, version, name, manifest_json, bundle_url, checksum, created_at FROM packs ORDER BY created_at DESC"
    );
    return res.json(result.rows);
  } catch (_err) {
    return res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
