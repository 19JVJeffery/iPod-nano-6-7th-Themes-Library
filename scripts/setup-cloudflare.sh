#!/usr/bin/env bash
set -euo pipefail

# Bootstraps Cloudflare resources/commands for this project.
# You must be logged in to Cloudflare via `wrangler login` first.

WORKER_NAME="${1:-nano-theme-library-api}"
R2_BUCKET="${2:-nano-theme-uploads}"
KV_BINDING="SUBMISSIONS_KV"

echo "==> Checking wrangler"
if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler is not installed. Install with: npm i -g wrangler"
  exit 1
fi

echo "==> Creating R2 bucket: ${R2_BUCKET} (ok if already exists)"
wrangler r2 bucket create "${R2_BUCKET}" || true

echo "==> Creating KV namespace: ${KV_BINDING}"
KV_OUTPUT="$(wrangler kv namespace create "${KV_BINDING}")"
echo "${KV_OUTPUT}"

KV_ID="$(printf '%s\n' "${KV_OUTPUT}" | sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -n1)"
if [[ -z "${KV_ID}" ]]; then
  echo "Could not parse KV id from wrangler output. Copy it manually."
else
  echo
  echo "KV namespace id detected: ${KV_ID}"
fi

echo
echo "==> Next step: create cloudflare-worker/wrangler.toml"
cat <<EOF
name = "${WORKER_NAME}"
main = "src/worker.mjs"
compatibility_date = "2026-04-15"

[[kv_namespaces]]
binding = "${KV_BINDING}"
id = "${KV_ID:-replace-with-kv-namespace-id}"

[[r2_buckets]]
binding = "UPLOADS_R2"
bucket_name = "${R2_BUCKET}"

[vars]
ALLOWED_ORIGIN = "https://19jvjeffery.github.io"
MAX_UPLOAD_MB = "512"
THEMES_SOURCE_URL = "https://raw.githubusercontent.com/19JVJeffery/iPod-nano-6-7th-Themes-Library/main/themes.json"
EOF

echo
echo "==> Then set secrets:"
cat <<'EOF'
cd cloudflare-worker
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_TOKEN_SECRET
wrangler secret put TURNSTILE_SECRET
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_BUCKET
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_PUBLIC_BASE_URL
EOF
