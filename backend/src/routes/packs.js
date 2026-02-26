const express = require("express");
const router = express.Router();
const { pool } = require("../db");

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT pack_id, version, name, manifest_json, bundle_url, checksum, created_at FROM packs ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

module.exports = router;