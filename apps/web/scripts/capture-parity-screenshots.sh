#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3210}"
OUT_DIR="${OUT_DIR:-test-results/snl-32}"

mkdir -p "$OUT_DIR"

capture() {
  local name="$1"
  local path="$2"
  local url="${BASE_URL}${path}"
  local output="${OUT_DIR}/${name}.png"

  echo "Capturing ${url} -> ${output}"
  npx playwright screenshot --wait-for-timeout=1200 --full-page "$url" "$output"
}

capture "01-dashboard" "/dashboard"
capture "02-dashboard-inbox" "/dashboard/inbox"
capture "03-dashboard-quotes" "/dashboard/quotes"
capture "04-dashboard-quote-detail" "/dashboard/quotes/novalis-logistics"
capture "05-dashboard-customers" "/dashboard/customers"

echo "Done. Screenshots saved in ${OUT_DIR}" 
