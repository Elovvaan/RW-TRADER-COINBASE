#!/usr/bin/env bash
# Smoke-test all API endpoints against a running agent
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"

  if [ -n "$body" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" "$BASE$path")
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path")
  fi

  if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 300 ]; then
    echo "  ✓  $label ($STATUS)"
    PASS=$((PASS+1))
  else
    echo "  ✗  $label ($STATUS)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "rw-trader-cb API smoke test → $BASE"
echo "──────────────────────────────────────"

check "GET /health"          GET  /health
check "GET /balances"        GET  /balances
check "GET /products"        GET  /products
check "GET /signals"         GET  /signals
check "GET /orders"          GET  /orders
check "GET /positions"       GET  /positions
check "GET /kill-switch"     GET  /kill-switch
check "GET /mode"            GET  /mode
check "POST /kill-switch on"  POST /kill-switch '{"active":true}'
check "POST /kill-switch off" POST /kill-switch '{"active":false}'
check "POST /mode ASSIST"     POST /mode        '{"authority":"ASSIST"}'

echo "──────────────────────────────────────"
echo "  Passed: $PASS  Failed: $FAIL"
echo ""
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
