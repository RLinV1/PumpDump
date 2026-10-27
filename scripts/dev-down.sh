#!/usr/bin/env bash
# Stop the stack; keep volumes unless --wipe is passed.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--wipe" ]; then docker compose down -v; else docker compose down; fi
