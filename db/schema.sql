-- LOCI Backend Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS packs (
  pack_id      TEXT NOT NULL,
  version      TEXT NOT NULL,
  name         TEXT NOT NULL,
  manifest_json JSONB NOT NULL,
  bundle_url   TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pack_id, version)
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id           BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('intent', 'qa')),
  pack_id      TEXT NOT NULL,
  input_text   TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);