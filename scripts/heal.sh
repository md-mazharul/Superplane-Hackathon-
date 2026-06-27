#!/usr/bin/env bash
# heal.sh — MANUAL fallback heal (the demo normally heals itself via Lazarus).
#
# Use this only if the Canvas didn't fire (network/alpha gremlins) and you need
# to restore a green service fast on stage. Sets BREAK_MODE=false and redeploys.
#
# Requires RENDER_API_KEY and RENDER_WEB_SERVICE_ID (see break.sh).
set -euo pipefail

: "${RENDER_API_KEY:?set RENDER_API_KEY}"
: "${RENDER_WEB_SERVICE_ID:?set RENDER_WEB_SERVICE_ID (srv-...)}"
API="https://api.render.com/v1"

echo "🩹 Setting BREAK_MODE=false on ${RENDER_WEB_SERVICE_ID} ..."
curl -sS -X PUT "${API}/services/${RENDER_WEB_SERVICE_ID}/env-vars/BREAK_MODE" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"value":"false"}' >/dev/null

echo "🚀 Triggering healthy redeploy ..."
curl -sS -X POST "${API}/services/${RENDER_WEB_SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' >/dev/null

echo "✓ Heal deploy launched. /health should return to 200 shortly."
