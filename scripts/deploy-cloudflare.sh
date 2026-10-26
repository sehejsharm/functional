#!/usr/bin/env bash
# Deploys the Mise API to Cloudflare (Worker + Durable Object + D1 + R2).
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
# Optional: ALLOWED_ORIGINS (comma-separated, e.g. https://mise.vercel.app), SETUP_TOKEN.
set -euo pipefail
cd "$(dirname "$0")/../worker"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}" "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
W="npx wrangler"

if grep -q 'REPLACE_WITH_D1_ID' wrangler.toml; then
  id=$($W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0));const d=l.find(x=>x.name==="mise");if(d)console.log(d.uuid)')
  if [ -z "$id" ]; then
    id=$($W d1 create mise --json 2>/dev/null | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).uuid)' || true)
    [ -z "$id" ] && id=$($W d1 list --json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="mise").uuid)')
  fi
  sed -i.bak "s/REPLACE_WITH_D1_ID/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "D1 database: $id"
fi

$W r2 bucket list 2>/dev/null | grep -q 'mise-photos' || $W r2 bucket create mise-photos
$W d1 migrations apply mise --remote

if [ -n "${ALLOWED_ORIGINS:-}" ]; then
  sed -i.bak "s#^ALLOWED_ORIGINS = .*#ALLOWED_ORIGINS = \"$ALLOWED_ORIGINS\"#" wrangler.toml && rm -f wrangler.toml.bak
fi

secrets=$($W secret list 2>/dev/null || echo '[]')
if ! echo "$secrets" | grep -q PASSKEY_PEPPER; then
  node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' | $W secret put PASSKEY_PEPPER
fi
if ! echo "$secrets" | grep -q SETUP_TOKEN; then
  token=${SETUP_TOKEN:-$(node -e 'console.log(require("crypto").randomBytes(12).toString("base64url"))')}
  echo "$token" | $W secret put SETUP_TOKEN
  echo "SETUP_TOKEN (needed once, at /setup): $token"
fi

$W deploy
