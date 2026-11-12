#!/usr/bin/env bash
# Usage: deploy/vm-env.sh < .env > vm.env
# Builds the public VM's .env from the owner's. Only the settings listed here are copied; every source, sentiment
# and alert switch from .env.example is forced off, and data stays mock unless DEPLOY_DATA_MODE=live (load tests).
set -euo pipefail
ROOT="$(dirname "$0")/.."
ALLOW='POSTGRES_USER|POSTGRES_PASSWORD|TOPIC_PARTITIONS|WATCHLIST|API_ALLOWED_ORIGINS|API_RATE_LIMIT_PER_MINUTE|PROXY_PORT'
grep -E "^[[:space:]]*($ALLOW)[[:space:]]*=" || true
sed -nE 's/^[[:space:]]*([A-Z_]+_ENABLED)[[:space:]]*=.*/\1=false/p' "$ROOT/.env.example"
printf 'DATA_MODE=%s\nRESEARCH_USE_MOCK_DATA=1\nUSE_MOCK_LLM=1\n' "${DEPLOY_DATA_MODE:-mock}"
