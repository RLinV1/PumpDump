# PumpDump (Pumpwatch)

Real-time detection of coordinated pump-and-dump activity for retail investors.
Pumpwatch watches social chatter, news, SEC filings and market data together,
and flags tickers where hype is rising without a real catalyst behind it.

The dashboard brings together risk scores, stock news, gainers/losers, observed intraday
swings and pretrained Bluesky sentiment. The output is a risk signal with its evidence,
not buy or sell advice. Sentiment describes sampled text; it does not predict returns.

![Current default workspace with all six monitoring panels (MOCK data)](docs/img/workspace-default.jpg)

More screenshots and the feature tour: [docs/product/walkthrough.md](docs/product/walkthrough.md).
The research service adds stock lookup and a flag assistant beside the pump panels. The assistant
explains why a ticker is or is not flagged; it never gives buy or sell advice.

## Architecture

Connectors publish normalized records to Kafka. A Kafka Streams pipeline turns them into
features, risk scores and flags. A read-only API stores and serves them over REST and SSE, and
optionally sends webhook alerts. A recorder stores supported topics so a time window can be replayed.
A Node web host serves the dashboard, adds news, movers and sentiment, and proxies the rest to the API.
A private Python service adds lookup and the flag assistant. Caddy fronts it all.

See **[docs/architecture/containers.md](docs/architecture/containers.md)** for the container
diagram, Kafka topics, ports, startup order and the life of one event, and
[docs/architecture/overview.md](docs/architecture/overview.md) for the logic inside each service.

The Java risk score (`rules-v1`) and the web sentiment models are separate outputs. Enabling
sentiment does not change the risk score.

## Run it

Needs Node 22.13+ for the web app. The backend needs Docker with Compose v2, plus JDK 21 and Maven 3.9+ to build.

```bash
[ -f .env ] || cp .env.example .env                  # keeps an existing local configuration
(cd web && npm ci && npm run dev)                    # DATA_MODE=mock: no backend or keys needed
docker compose --profile apps up -d --build --wait   # full stack in containers, then open http://localhost/
```

New setups default to `DATA_MODE=mock`. For live mode, put your Alpaca keys in the root `.env`
(never commit it), set `DATA_MODE=live` and `ALPACA_ENABLED=true`. All news, filing and social
sources are off by default until their terms are confirmed. Real Alpaca data stays on your machine:
public deployments and README images use labelled mock data. Details, Windows commands and the
news demo runbook: [docs/operations/local-setup.md](docs/operations/local-setup.md). Web options: [web/README.md](web/README.md).

## Documentation

Everything is indexed in **[docs/README.md](docs/README.md)**. The main entries:

| Guide | What it explains |
| --- | --- |
| [Containers](docs/architecture/containers.md) | Docker services, topics, ports, startup, record/replay, mock vs live |
| [Architecture](docs/architecture/overview.md) | Event flow, APIs, storage and configuration |
| [Tech stack](docs/architecture/tech-stack.md) | Technologies, versions and repository layout |
| [Risk scorer](docs/ml/rule-scorer.md) | Thresholds, catalyst deductions, feature contributions |
| [Offline ML](ml/README.md) | Python training, evaluation and synthetic-data commands |
| [Live sentiment](ml/LIVE-SENTIMENT.md) | Pretrained models, matching rules, retention and limits |
| [Source register](docs/data/sources.md) | Source permissions and verification status |
| [Source terms](docs/data/terms.md) | Storage terms and rate limits found per source |
| [Deploy: GCP](docs/operations/gcp.md) | Terraform runbook for the mock-data deployment |
| [Load tests](docs/operations/load-test.md) | k6 read and SSE tests |
| [Roadmap](docs/product/roadmap.md) | Milestones; task checklists live in `openspec/changes/` |

## Project status

Alpaca/Bluesky/news/filings ingestion, recording/replay, rules scoring, the read API,
webhooks and the web dashboard are implemented. Source enablement and usage permissions
are separate from adapter availability. Reddit ingestion, a curated labeled dataset, learned
pump-model serving, learned volatility surfaces and the cloud proof remain incomplete. The
Python training workflow exists; synthetic training does not establish predictive performance.

Milestone status, following [docs/product/roadmap.md](docs/product/roadmap.md) (checked 2026-11-10 against the GitHub milestones):

| Milestone | Status |
| --- | --- |
| M1 Skeleton and contracts | Done |
| M2 Ingestion and replay | Nearly done: only #23 week-1 checks and wrap-up is open |
| M3 News and filings | Nearly done: only #30 wrap-up is open (source terms and the end-to-end demo) |
| M4 Rules pipeline end to end | In progress: #33, #43 and #44 are open |
| M5 Labels and first model | Not done: dataset, training and serving open |
| M6 Volatility forecast | In progress: baseline done, model and evaluation open |
| M7 API, alerts and live web | Mostly done: #6 web and #40 surfaces are open |
| M8 Cloud smoke test | Not started (owner runs any cloud step) |

Plans live in `openspec/changes/` ([OpenSpec](https://github.com/Fission-AI/OpenSpec)). This
documentation describes the current checkout, including work submitted in open PRs.

## Workflow and checks

Use a type-prefixed feature branch (`feat/<slug>`). Commits use Conventional Commit messages, and
changes reach `main` through a pull request.

Run `mvn -B verify` from the root. In `web/`, run `npm test`, `npm run lint` and `npm run build`.
In `research/`, run `uv run --python 3.13 --extra dev pytest -q`. In `ml/`, install
`requirements-dev.txt` and run `python -m pytest`. Docker is needed for the Testcontainers
integration tests. GitHub Actions also runs dependency-license checks; see the
[build and test tools](docs/architecture/tech-stack.md#checks-and-build-tools).

## License

The code and the trained models are released under the [MIT License](LICENSE). The license
covers this project's own work only. Market data, news and social posts stay under their
providers' terms (see [docs/data/sources.md](docs/data/sources.md)); the MIT license grants no
rights to them.
