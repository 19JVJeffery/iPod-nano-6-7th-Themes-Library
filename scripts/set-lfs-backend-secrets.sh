#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-lfs-worker/.secrets.env}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/lfs-worker"
WRANGLER_TOML="${WORKER_DIR}/wrangler.toml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  echo "Copy lfs-worker/.secrets.env.example to lfs-worker/.secrets.env and fill values."
  exit 1
fi

if [[ ! -f "${WRANGLER_TOML}" ]]; then
  echo "Missing ${WRANGLER_TOML}"
  echo "Copy lfs-worker/wrangler.toml.example to lfs-worker/wrangler.toml and set vars."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required=(
  ADMIN_PASSWORD
  ADMIN_TOKEN_SECRET
  STATE_TOKEN_SECRET
  GITHUB_APP_ID
  GITHUB_APP_INSTALLATION_ID
  GITHUB_APP_PRIVATE_KEY
)

for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required secret: ${key}"
    exit 1
  fi
done

for key in "${required[@]}"; do
  printf '%s' "${!key}" | wrangler secret put "${key}" --config "${WRANGLER_TOML}"
done

echo "LFS backend secrets set."
