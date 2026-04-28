#!/bin/bash

BASE="http://localhost:8080"
EMAIL="sakshisamu18@gmail.com"
PASS="Sakshi"

echo ""
echo "=============================="
echo "  LOCI BACKEND DEMO"
echo "=============================="

echo ""
echo "1. Health Check"
curl -s $BASE/health | python3 -m json.tool

echo ""
echo "2. Login → Get JWT Token"
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token received: ${TOKEN:0:40}..."

echo ""
echo "3. Protected Route — GET /packs"
curl -s $BASE/packs \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "4. AI Intent — Navigate"
curl -s -X POST $BASE/ai/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"text": "Take me to cafeteria", "pack_id": "a3_polaris"}' \
  | python3 -m json.tool

echo ""
echo "5. AI Intent — Query"
curl -s -X POST $BASE/ai/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"text": "What floor is HR on?", "pack_id": "a3_polaris"}' \
  | python3 -m json.tool

echo ""
echo "6. AI QA — Knowledge Match"
curl -s -X POST $BASE/ai/qa \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question": "What are the cafeteria timings?", "pack_id": "a3_polaris"}' \
  | python3 -m json.tool

echo ""
echo "7. AI QA — Fallback (no match)"
curl -s -X POST $BASE/ai/qa \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question": "Tell me about Mars", "pack_id": "a3_polaris"}' \
  | python3 -m json.tool

echo ""
echo "8. Auth Guard — No Token"
curl -s $BASE/packs | python3 -m json.tool

echo ""
echo "=============================="
echo "  ALL TESTS DONE"
echo "=============================="
