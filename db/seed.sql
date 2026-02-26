INSERT INTO packs (pack_id, version, name, manifest_json, bundle_url, checksum)
VALUES (
  'a3_polaris',
  '0.0.1',
  'Structured Indoor Pack (A3 Polaris)',
  '{
    "packId": "a3_polaris",
    "name": "Structured Indoor Pack (A3 Polaris)",
    "version": "0.0.1",
    "assets": {
      "graph": "graph.json",
      "pois": "pois.json",
      "audioIndex": "audio_index.json",
      "knowledge": "knowledge.json",
      "wifiFingerprints": "wifi_fingerprints.json"
    }
  }'::jsonb,
  'local://packs/a3_polaris/v0',
  'sha256:placeholder'
)
ON CONFLICT (pack_id, version) DO NOTHING;