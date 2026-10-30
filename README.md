# PumpDump (Pumpwatch)

Real-time detection of coordinated pump-and-dump activity for retail investors.
Pumpwatch watches social chatter, news, SEC filings and market data together,
and flags tickers where hype is rising without a real catalyst behind it.

The dashboard brings together risk scores, stock news, gainers/losers, observed intraday
swings and pretrained Bluesky sentiment. The output is a risk signal with its evidence,
not buy or sell advice. Sentiment describes sampled text; it does not predict returns.

## Documentation

| Guide | What it explains |
| --- | --- |
| [Tech stack](docs/tech-stack.md) | Technologies, versions, responsibilities and repository layout |
| [Architecture](docs/architecture.md) | Service diagrams, event flow, APIs, storage and configuration |
| [Web setup](web/README.md) | Mock/live modes, personal watchlists and frontend checks |
| [Live sentiment](ml/LIVE-SENTIMENT.md) | Pretrained model, matching rules, retention and limits |
| [Risk scorer](docs/rule-scorer.md) | Thresholds, catalyst deductions and feature contributions |
| [Offline ML](ml/README.md) | Python training, evaluation and synthetic-data commands |
| [Source register](docs/data-sources.md) | Source permissions and verification status |
| [Roadmap](docs/roadmap.md) | Planned milestones; implementation checklists live in `openspec/changes/` |

## How it works

1. **Ingest.** Connectors publish normalized records to Kafka topics:
   - `raw-posts`: Bluesky posts from the enabled Java connector; Reddit ingestion remains planned
   - `ticks`: Alpaca trade ticks (quotes are out of scope for now), keyed by ticker
   - `raw-news`: Alpaca News, Finnhub and press-release RSS
   - `raw-filings`: SEC EDGAR 8-K filings
   - `ingest-dlq`: records that failed validation
   - `source-health`: each connector's health every 15 s, used to mark stale sources on scores
2. **Record and replay.** Supported input and derived topics are recorded with their
   event times. Replay republishes recorded inputs at original or accelerated speed,
   either to base topics or isolated run topics. Isolated topics do not automatically
   provision another processing topology; see [replay boundaries](docs/architecture.md#recording-and-replay).
3. **Score.** An event-time pipeline combines social, market and catalyst
   features with a versioned rules scorer. Learned models remain behind their
   training, serving and promotion gates.
4. **Read and alert.** A read-only API exposes scores, timelines and flags;
   optional webhooks deliver alerts. The web app labels mock, live and simulated data.
5. **Add context.** The Node web host separately reads Alpaca news and market movers
   and runs a pretrained Financial DistilRoBERTa model on matching Bluesky posts.
   Positive, neutral and negative counts appear beside the selected stock.

The Java risk score and the web sentiment model are separate outputs. Enabling
sentiment does not enable Java social features or change the risk score.

Users can select stocks from gainers, losers or intraday swings, and add/remove up to
30 symbols in a browser-saved personal watchlist. Added stocks open news and sentiment;
they show **No risk score yet** if the backend has no coverage. Personal edits do not
change the shared market-data subscription.

## Stack

| Layer | Technologies |
| --- | --- |
| Dashboard | Next.js 16.4.2, React 19.3.0, TypeScript, Tailwind CSS 4 |
| Web host and sentiment | Node.js, Transformers.js 4.3.2, quantized ONNX model on CPU |
| Backend | Java 21, Spring Boot 3.5.5, Spring Kafka, Maven |
| Events and persistence | Apache Kafka 3.9.1, Kafka Streams, PostgreSQL 17, JDBC, Flyway |
| Offline research | Python, LightGBM, scikit-learn, pandas, NumPy |
| Infrastructure and checks | Docker Compose, GitHub Actions, JUnit, Testcontainers, Node test runner, pytest |

Versions come from repository manifests and Compose. See [tech stack](docs/tech-stack.md)
for each tool's role. Cloud deployment remains planned.

## Project status

Alpaca/Bluesky/news/filings ingestion, recording/replay, rules scoring, the read API,
webhooks and the web dashboard are implemented. Source enablement and usage permissions
are separate from adapter availability. The web app runs without keys in mock mode.
Reddit ingestion, a curated labeled dataset, learned pump-model serving, learned
volatility surfaces and the cloud proof remain incomplete. The Python training
workflow exists; synthetic training does not establish predictive performance.

This documentation describes the current checkout, including work submitted in open
PRs. The [OpenSpec](https://github.com/Fission-AI/OpenSpec) plans live in `openspec/changes/`:

| Change | Scope |
| --- | --- |
| `add-ingestion-pipeline` | Reddit and Alpaca connectors, Kafka topics, dead-letter handling, record and replay |
| `add-news-ingestion` | Alpaca News, SEC EDGAR 8-K, Finnhub and press-release RSS |

## Workflow

Use a descriptive feature branch; Codex-created branches use `codex/`. Commits use
Conventional Commit messages, and changes reach `main` through a pull request.

## Run locally

For the web app: Node 22.13+. For the backend: Docker with Compose v2, JDK 21 or newer
and Maven 3.9+. Offline research uses Python 3.11+; CI uses Python 3.12.

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

Compose runs the Java services, Kafka and PostgreSQL; start the web host separately
with npm. Set `SENTIMENT_ENABLED=true` for the independent web sentiment service.
`BLUESKY_ENABLED` separately controls Java social ingestion. Restart the web server
after configuration changes; rebuild production web output after changing `API_ORIGIN`.

Scores may lag while connectors backfill a gap; inspect their data age. Sentiment
collects new matching posts rather than searching history, and its counts clear on
web-server restart. A zero count means no retained matching samples, not an absence
of all discussion about that stock.

With `--apps`, health is at http://localhost:8080/actuator/health (connectors)
and http://localhost:8081/actuator/health (replay), 8082 (pipeline), and 8083 (API).
The containers read `.env` and use Kafka and Postgres inside the Compose network.
See [web setup](web/README.md) for `DATA_MODE=live`, private API proxy configuration,
source enablement and the distinction between mock data and real-feed validation.

To run the apps from the IDE instead, use `scripts/dev-up.sh` (infra only) and
export `.env` first, because Spring Boot does not read it:
`set -a; source .env; set +a`. Then start the `connectors` and `replay` main
classes; they reach Kafka on 127.0.0.1:9092 and Postgres on 127.0.0.1:5432.

## Development checks

Run `mvn -B verify` from the root. In `web/`, run `npm test`, `npm run lint` and
`npm run build`. In `ml/`, install `requirements-dev.txt` and run `python -m pytest`.
Docker is needed for Testcontainers integration tests; web tests open local HTTP/SSE
listeners. GitHub Actions also runs dependency-license checks. See the
[build and test tools](docs/tech-stack.md#checks-and-build-tools) for details.
