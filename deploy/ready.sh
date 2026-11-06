#!/usr/bin/env bash
# Usage: deploy/ready.sh [base-url]  -- passes only when the web app and the API both answer.
BASE=${1:-http://localhost}
for i in $(seq 60); do
  if curl -fsS -o /dev/null "$BASE/" && curl -fsS -o /dev/null "$BASE/api/v1/watchlist"; then echo "ready: $BASE"; exit 0; fi
  sleep 10
done
echo "not ready after 10 minutes: $BASE" >&2; exit 1
