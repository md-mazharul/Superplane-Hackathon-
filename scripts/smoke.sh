#!/usr/bin/env bash
# smoke.sh — hit lazarus-web /health and exit non-zero if unhealthy.
# Usage:  HEALTH_URL=https://lazarus-web.onrender.com ./scripts/smoke.sh
#   or:   ./scripts/smoke.sh https://lazarus-web.onrender.com
set -euo pipefail

BASE_URL="${1:-${HEALTH_URL:-http://localhost:3000}}"
BASE_URL="${BASE_URL%/}"
URL="${BASE_URL}/health"

echo "› GET ${URL}"
# -s silent, -w write http code, capture body + code separately
HTTP_BODY="$(curl -sS -m 10 -w '\n%{http_code}' "${URL}")" || {
  echo "✗ request failed (service unreachable / cold start?)" >&2
  exit 2
}

CODE="$(printf '%s' "${HTTP_BODY}" | tail -n1)"
BODY="$(printf '%s' "${HTTP_BODY}" | sed '$d')"

echo "${BODY}"
echo "› HTTP ${CODE}"

if [ "${CODE}" = "200" ]; then
  echo "✓ healthy"
  exit 0
else
  echo "✗ unhealthy (HTTP ${CODE})" >&2
  exit 1
fi
