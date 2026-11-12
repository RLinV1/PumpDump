# Run locally

For the web app: Node 22.13+. For the backend: Docker with Compose v2, JDK 21 or newer
and Maven 3.9+. Offline research uses Python 3.12+; the combined Python CI check uses Python 3.13.

```bash
[ -f .env ] || cp .env.example .env # preserve an existing local configuration
(cd web && npm ci && npm run dev) # DATA_MODE=mock: no backend or keys needed

# Backend development and live-mode prerequisites:
scripts/dev-up.sh         # infra only: Kafka (KRaft), Postgres, topics
scripts/dev-up.sh --apps  # infra plus connectors, replay, pipeline and API
mvn -B verify             # build and test the Java modules
scripts/dev-down.sh       # stops everything; add --wipe to also delete volumes
```

On Windows, the mock dashboard can be started from PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Set-Location web
npm ci
npm run dev
```

Open [localhost:3000/live](http://localhost:3000/live). New setups default to
`DATA_MODE=mock`; existing `.env` files keep their current mode. To use port 3100,
set `$env:PORT='3100'` before starting the web server.

For live mode, privately fill in the Alpaca keys in root `.env`, set
`DATA_MODE=live` and `ALPACA_ENABLED=true`, then start the backend. A shell-independent
alternative to the Bash helper is:

```sh
docker compose --profile apps up -d --build --wait
```

The `apps` profile runs the Java services, Kafka, PostgreSQL, the web host, `research` and the Caddy
proxy (see [containers](../architecture/containers.md)); `scripts/dev-up.sh --apps` starts only the
Java services, so run the web host with npm. Set `SENTIMENT_ENABLED=true` for the independent web sentiment service.
`BLUESKY_ENABLED` separately controls Java social ingestion. Restart the web server
after configuration changes; rebuild production web output after changing `API_ORIGIN`.

Scores may lag while connectors backfill a gap; inspect their data age. Sentiment
searches can classify recent posts immediately. The optional live-stream sample
collects posts after startup/selection and clears on restart. A zero count means no
matching posts in that sample, not an absence of all discussion about the stock.

With `--apps`, health is at http://localhost:8080/actuator/health (connectors)
and http://localhost:8081/actuator/health (replay), 8082 (pipeline), and 8083 (API).
The containers read `.env` and use Kafka and Postgres inside the Compose network.
See [web setup](../../web/README.md) for `DATA_MODE=live`, private API proxy configuration,
source enablement and the distinction between mock data and real-feed validation.

To run the apps from the IDE instead, use `scripts/dev-up.sh` (infra only) and
export `.env` first, because Spring Boot does not read it:
`set -a; source .env; set +a`. Then start the `connectors` and `replay` main
classes; they reach Kafka on 127.0.0.1:9092 and Postgres on 127.0.0.1:5432.


## Runbook: end-to-end news demo (owner, needs live keys and Docker)


```sh
# 1. In .env: ALPACA_KEY_ID/ALPACA_SECRET_KEY, ALPACA_NEWS_ENABLED=true, SEC_ENABLED=true,
#    SEC_USER_AGENT="Name email", FINNHUB_ENABLED=true, FINNHUB_TOKEN=..., RSS_ENABLED=true,
#    RSS_FEEDS=<comma-separated feed URLs>, plus ALPACA_ENABLED=true for ticks.
docker compose --profile apps up -d --build --wait
# 2. Let it run for a while; the recorder (replay service) stores raw-news, raw-filings, raw-posts and ticks.
curl -s http://127.0.0.1:8080/actuator/health   # connectors
# 3. Replay the recorded window at 10x (replace the range with the recorded one).
curl -s -X POST http://127.0.0.1:8081/replays -H "Content-Type: application/json" \
  -d '{"from":"2026-01-01T14:00:00Z","to":"2026-01-01T15:00:00Z","speed":10,"isolated":false}'
```

Check that news, filings, posts and ticks arrive interleaved in event-time order. Replayed
records carry the replay header and are not re-recorded. Use `"isolated":true` to publish to
`replay.<runId>.<topic>` instead.

