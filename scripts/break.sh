#!/usr/bin/env bash
# break.sh — inject a failure into lazarus-web, on cue, for the demo.
#
# Sets BREAK_MODE=true on the Render service and triggers a fresh deploy. That
# deploy goes live but /health returns 500 -> render.onDeploy fires -> the
# Lazarus Canvas detects it -> the agent rolls back -> service heals. No human.
#
# Requires:
#   RENDER_API_KEY         Render API key (Account Settings -> API Keys)
#   RENDER_WEB_SERVICE_ID  the lazarus-web service id (srv-xxxxxxxx)
#
# Alternative trigger (no API key): make a one-line commit that sets
#   BREAK_MODE: "true" in render.yaml and push — autoDeploy will redeploy.
set -euo pipefail

: "${RENDER_API_KEY:?set RENDER_API_KEY}"
: "${RENDER_WEB_SERVICE_ID:?set RENDER_WEB_SERVICE_ID (srv-...)}"
API="https://api.render.com/v1"

echo "💥 Setting BREAK_MODE=true on ${RENDER_WEB_SERVICE_ID} ..."
curl -sS -X PUT "${API}/services/${RENDER_WEB_SERVICE_ID}/env-vars/BREAK_MODE" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"value":"true"}' >/dev/null

echo "🚀 Triggering deploy (this is the deploy Lazarus will catch) ..."
curl -sS -X POST "${API}/services/${RENDER_WEB_SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' | sed 's/.*"id":"\([^"]*\)".*/  deploy id: \1/' || true

echo "✓ Broken deploy launched. Watch the Lazarus Canvas light up."
