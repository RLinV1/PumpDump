# PumpDump (Pumpwatch)

Real-time detection of coordinated pump-and-dump activity for retail investors.
Pumpwatch watches social chatter, news, SEC filings and market data together,
and flags tickers where hype is rising without a real catalyst behind it.

The output is a risk signal with its evidence. It is not buy or sell advice.

## How it works

1. **Ingest.** Connectors publish normalized records to Kafka topics:
   - `raw-posts`: Bluesky and Reddit posts
   - `ticks`: Alpaca trade ticks (quotes are out of scope for now), keyed by ticker
   - `raw-news`: Alpaca News, Finnhub and press-release RSS
   - `raw-filings`: SEC EDGAR 8-K filings
   - `ingest-dlq`: records that failed validation
   - `source-health`: each connector's health every 15 s, used to mark stale sources on scores
2. **Record and replay.** Every record is stored with its event time and can be
   replayed into the same topics at original or accelerated speed, so backtests
   and demos run the same code as live data.
3. **Score.** An event-time pipeline combines social, market and catalyst
   features with a versioned rules scorer. Learned models remain behind their
   training, serving and promotion gates.
4. **Read and alert.** A read-only API exposes scores, timelines and flags;
   optional webhooks deliver alerts. The web app labels mock, live and simulated data.

## Stack

Java 21, Spring Boot, Kafka, PostgreSQL, Python training tools and a Next.js/React
web app. Terraform deployment remains planned.

## Project status

Ingestion, replay, rules scoring, the read API, webhooks and the web app are
implemented. The web app runs without keys in mock mode. Real-feed verification
requires credentials and verified source terms; learned serving, volatility
surfaces and the cloud proof remain in the roadmap. The
[OpenSpec](https://github.com/Fission-AI/OpenSpec) plans live in `openspec/changes/`:

| Change | Scope |
| --- | --- |
| `add-ingestion-pipeline` | Reddit and Alpaca connectors, Kafka topics, dead-letter handling, record and replay |
| `add-news-ingestion` | Alpaca News, SEC EDGAR 8-K, Finnhub and press-release RSS |

## Workflow

Work happens on type-prefixed branches (`feat/...`, `docs/...`, `chore/...`)
with Conventional Commit messages. Changes reach `main` only through a pull
request.

## Run locally

For the web app: Node 22.13+. For the backend: Docker with Compose v2, JDK 21 or newer and Maven 3.9+.

```bash
cp .env.example .env      # credentials stay empty until you add your own
(cd web && npm ci && npm run dev) # DATA_MODE=mock: no backend or keys needed

# Backend development and live-mode prerequisites:
scripts/dev-up.sh         # infra only: Kafka (KRaft), Postgres, topics
scripts/dev-up.sh --apps  # infra plus connectors, replay, pipeline and API
mvn -B verify             # build and test the Java modules
scripts/dev-down.sh       # stops everything; add --wipe to also delete volumes
```

With `--apps`, health is at http://localhost:8080/actuator/health (connectors)
and http://localhost:8081/actuator/health (replay), 8082 (pipeline), and 8083 (API).
The containers read `.env` and use Kafka and Postgres inside the Compose network.
See [web setup](web/README.md) for `DATA_MODE=live`, private API proxy configuration,
source enablement and the distinction between mock data and real-feed validation.

To run the apps from the IDE instead, use `scripts/dev-up.sh` (infra only) and
export `.env` first, because Spring Boot does not read it:
`set -a; source .env; set +a`. Then start the `connectors` and `replay` main
classes; they reach Kafka on 127.0.0.1:9092 and Postgres on 127.0.0.1:5432.
