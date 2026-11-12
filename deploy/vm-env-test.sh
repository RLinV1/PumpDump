#!/usr/bin/env bash
# Usage: bash deploy/vm-env-test.sh   (checks that nothing sensitive reaches the public VM's .env)
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(printf '%s\n' BLUESKY_ENABLED=true SEC_ENABLED=true SEC_USER_AGENT=x@y GEMINI_API_KEY=k ALPACA_KEY_ID=a \
  REDDIT_CLIENT_SECRET=s FINNHUB_TOKEN=t ALERTS_WEBHOOK_URLS=https://x 'export ALPACA_ENABLED=true' DATA_MODE=live \
  'export POSTGRES_PASSWORD=pw' WATCHLIST=GME | bash deploy/vm-env.sh)
fail() { echo "FAIL: $1" >&2; exit 1; }
! grep -q '^export' <<<"$out" || fail "export prefix kept"
for leak in x@y GEMINI k= https://x ALPACA_KEY REDDIT_CLIENT FINNHUB_TOKEN DATA_MODE=live =true; do
  ! grep -qF -- "$leak" <<<"$out" || fail "leaked $leak"
done
for want in POSTGRES_PASSWORD=pw WATCHLIST=GME BLUESKY_ENABLED=false SEC_ENABLED=false ALERTS_ENABLED=false \
  ALPACA_ENABLED=false SENTIMENT_ENABLED=false DATA_MODE=mock RESEARCH_USE_MOCK_DATA=1 USE_MOCK_LLM=1; do
  grep -qxF -- "$want" <<<"$out" || fail "missing $want"
done
[ "$(DEPLOY_DATA_MODE=live bash deploy/vm-env.sh </dev/null | grep -c '^DATA_MODE=live$')" = 1 ] || fail "DEPLOY_DATA_MODE=live"
echo "vm-env ok"
