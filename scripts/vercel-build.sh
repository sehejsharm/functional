#!/usr/bin/env bash
# Vercel build: when Cloudflare credentials are present, deploy the API first and point the web app at it.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -z "${VITE_API_URL:-}" ]; then
  origins="http://localhost:5173"
  for h in "${VERCEL_PROJECT_PRODUCTION_URL:-}" "${VERCEL_BRANCH_URL:-}" "${VERCEL_URL:-}"; do [ -n "$h" ] && origins="$origins,https://$h"; done
  origins="$origins,*-sehejsharms-projects.vercel.app"
  log=$(mktemp)
  ALLOWED_ORIGINS="$origins" bash scripts/deploy-cloudflare.sh 2>&1 | tee "$log"
  url=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$log" | head -1)
  [ -n "$url" ] || { echo "Worker deployed but its workers.dev URL was not found in the output"; exit 1; }
  export VITE_API_URL="$url"
  echo "API: $VITE_API_URL"
fi
npm run build
