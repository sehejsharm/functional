#!/usr/bin/env bash
# Deploys the Mise API to Cloudflare (Worker + Durable Object + D1 + R2).
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Optional: ALLOWED_ORIGINS, SETUP_TOKEN.
# Safe to run on every build: existing database, bucket and secrets are reused.
set -euo pipefail
cd "$(dirname "$0")/../worker"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}" "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
W="npx --no-install wrangler"
export WRANGLER_SEND_METRICS=false CI=true

d1_id() { $W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s).find(x=>x.name==="mise");if(d)console.log(d.uuid)}catch{}})'; }
id=$(d1_id)
if [ -z "$id" ]; then $W d1 create mise >/dev/null; id=$(d1_id); fi
[ -n "$id" ] || { echo "Could not create or find the D1 database 'mise'"; exit 1; }
sed -i.bak "s/^database_id = .*/database_id = \"$id\"/" wrangler.toml && rm -f wrangler.toml.bak
echo "D1 database: $id"

$W r2 bucket list 2>/dev/null | grep -q 'mise-photos' || $W r2 bucket create mise-photos
$W d1 migrations apply mise --remote

if [ -n "${ALLOWED_ORIGINS:-}" ]; then
  sed -i.bak "s#^ALLOWED_ORIGINS = .*#ALLOWED_ORIGINS = \"$ALLOWED_ORIGINS\"#" wrangler.toml && rm -f wrangler.toml.bak
fi

$W deploy

secrets=$($W secret list 2>/dev/null || echo '[]')
if ! echo "$secrets" | grep -q PASSKEY_PEPPER; then
  node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' | $W secret put PASSKEY_PEPPER
fi
if [ -n "${SETUP_TOKEN:-}" ]; then
  printf '%s' "$SETUP_TOKEN" | $W secret put SETUP_TOKEN
elif ! echo "$secrets" | grep -q SETUP_TOKEN; then
  token=$(node -e 'console.log(require("crypto").randomBytes(12).toString("base64url"))')
  printf '%s' "$token" | $W secret put SETUP_TOKEN
  echo "SETUP_TOKEN (needed once, at /setup): $token"
fi
