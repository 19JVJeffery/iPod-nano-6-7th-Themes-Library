#!/usr/bin/env bash
set -euo pipefail

# Loads secrets from a .env file and writes them to Cloudflare Worker secrets.
# Usage:
#   ./scripts/set-cloudflare-secrets.sh cloudflare-worker/.secrets.env

ENV_FILE="${1:-cloudflare-worker/.secrets.env}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/cloudflare-worker"
WRANGLER_TOML="${WORKER_DIR}/wrangler.toml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  echo "Copy cloudflare-worker/.secrets.env.example to .secrets.env and fill it."
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler not found. Install with: npm i -g wrangler"
  exit 1
fi

if [[ ! -f "${WRANGLER_TOML}" ]]; then
  echo "Missing ${WRANGLER_TOML}"
  echo "Run: npm run cf:bootstrap"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required=(
  ADMIN_PASSWORD
  ADMIN_TOKEN_SECRET
  TURNSTILE_SECRET
  R2_ACCOUNT_ID
  R2_BUCKET
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_PUBLIC_BASE_URL
)

for key in "${required[@]}"; do
  value="${!key:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing required secret: ${key}"
    exit 1
  fi
done

for key in "${required[@]}"; do
  printf '%s' "${!key}" | wrangler secret put "${key}" --config "${WRANGLER_TOML}"
done

echo "Cloudflare Worker secrets updated."
