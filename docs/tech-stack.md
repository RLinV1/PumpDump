# Tech stack

Pumpwatch uses Java for durable event processing, Node for its dashboard and live
context services, and Python for offline research. Versions below describe this
checkout; manifests and lockfiles remain the source of truth.

## Runtime technologies

| Technology | Version/configuration | What it does here |
| --- | --- | --- |
| Java | 21 target in [parent POM](../pom.xml) | Runs connectors, recording/replay, risk processing and the API |
| Spring Boot | 3.5.5 | Dependency injection, configuration, HTTP services, scheduled work and health endpoints |
| Spring Kafka / Kafka Streams | Managed by Spring Boot | Kafka clients and stateful event-time processing |
| Apache Kafka | 3.9.1 in [Compose](../docker-compose.yml) | Carries source, feature, score and flag streams; local setup is one KRaft broker |
| PostgreSQL | 17 in Compose | Connector outboxes/positions, recordings, API read tables and alert delivery state |
| JDBC / Flyway | Managed Java dependencies | Explicit SQL and versioned database migrations |
| Node.js | 22.13+ recommended; Node 22 web CI | Custom Next.js server, provider adapters and local sentiment inference |
| Next.js / React | 16.4.2 / 19.3.0 | App Router pages, server-rendered landing shell and interactive dashboard |
| TypeScript / Tailwind CSS | Version 5 / version 4 ranges | Typed UI/API contracts, response validation and visual tokens |
| GSAP / Lenis | Ranges in [web package](../web/package.json) | Existing hero motion and smooth scrolling |
| Transformers.js | `@huggingface/transformers` 4.3.2 | Loads and runs a pinned quantized ONNX sentiment model on CPU |

The web lockfile resolves JavaScript dependency ranges. Maven manages Java versions
through its parent, and Python requirements pin its environment. These are repository
versions, not recommendations to install an unverified latest release.

## How the main parts work

### Java: durable risk processing

Connectors normalize source data into the records defined in `common/`, validate
them, and publish through a PostgreSQL outbox. Kafka decouples source fetching from
consumers. Kafka Streams then maintains ticker features, applies the selected scorer
and emits flags. The API copies results into PostgreSQL so each dashboard request
can query indexed tables instead of reconstructing state from Kafka.

The default scorer is `rules-v1`, a documented threshold table with catalyst
deductions. The alternative `anomaly-v1` compares features against earlier per-ticker
observations. `pipeline.scorer` selects between them. Neither is the pretrained
sentiment model. See [the scorer guide](rule-scorer.md).

### Node and React: dashboard and context

The browser calls same-origin `/api/v1/...` routes. The custom Node server handles
mock mode, reads live Alpaca news/movers, runs sentiment, and forwards risk reads
to Spring. Provider keys stay on the server. React manages ticker selection,
refresh, polling, SSE flags and personal watchlists.

The personal watchlist uses `localStorage` and `useSyncExternalStore`. It persists
within a browser origin and can synchronize open tabs through storage events;
there is no account database or cross-device watchlist synchronization.

Use `npm run dev` or `npm start`: both run [server.mjs](../web/server.mjs).
Running `next start` directly bypasses its mock/context routing and header handling.
Builds use webpack because the project recorded a Windows Turbopack CSS-worker issue.

### Pretrained sentiment: local text classification

Transformers.js runs the quantized ONNX version of Financial DistilRoBERTa, pinned
to a revision in [bluesky-sentiment.mjs](../web/bluesky-sentiment.mjs). It classifies
matching public posts as positive, neutral or negative. It is pretrained elsewhere;
this application does not retrain it, and its labels do not alter Java risk scores.

First enabled startup may download model files into the ignored
`.playwright-mcp/sentiment-model-cache/` directory. Inference runs locally on CPU.
The model was trained on financial news; accuracy on social-media language remains
an evaluation question. [Live sentiment](../ml/LIVE-SENTIMENT.md) documents the
license, model revision, matching, deletion handling and resource limits.

### Python: offline model research

| Library | Role |
| --- | --- |
| LightGBM | Tabular pump-risk classifier with catalyst constraints |
| scikit-learn | Isotonic calibration and evaluation support |
| pandas / NumPy | Feature tables, preparation and numerical operations |
| SciPy and supporting pinned packages | Statistical and numerical dependencies |

The [ML package](../ml/README.md) provides training/evaluation with time splits,
baselines, bootstrap intervals and a promotion gate. It also implements volatility
baselines. Synthetic inputs exercise the workflow; they do not demonstrate market
predictive value. Learned model export/serving and learned volatility surfaces remain
unfinished. The dashboard's live sentiment feature does not invoke this Python pipeline.

## Repository map

| Path | Responsibility | Useful entry points |
| --- | --- | --- |
| `common/` | JSON records, schema versions, topics and validation | `PostRecord`, `Score`, `Flag`, `Topics`, `Validator` |
| `connectors/` | Alpaca, Bluesky, news, SEC and RSS ingestion | `AlpacaConnector`, `BlueskyConnector`, `ConnectorPublisher` |
| `pipeline/` | Mention extraction, features, scoring and flagging | `PipelineApplication`, `FeatureStage`, `RuleScorer` |
| `replay/` | Event recording and paced republication | `Recorder`, `Replayer`, `ReplayController` |
| `api/` | Risk read models, REST/SSE and optional webhooks | `Ingest`, `ApiController`, `ReadRepository`, `SseHub`, `alerts/` |
| `web/app/` | Landing and live dashboard routes | `page.tsx`, `live/page.tsx` |
| `web/components/` | Dashboard and landing UI | `live-view.tsx`, `market-context.tsx`, `landing-market.tsx` |
| `web/*.mjs` | Web server, mock API and live adapters | `server.mjs`, `context-api.mjs`, `bluesky-sentiment.mjs` |
| `web/lib/` | API contracts, polling and saved watchlists | `api.ts`, `use-api.ts`, `watchlist.ts` |
| `ml/` | Offline research and sentiment documentation | `pumpml/`, `README.md`, `LIVE-SENTIMENT.md` |
| `scripts/` | Infrastructure helpers and dependency/register checks | `dev-up.sh`, `dev-down.sh`, `license-gate.sh` |
| `openspec/` | Proposals, designs, specs and task lists | `changes/` |

## Checks and build tools

- **Maven:** multi-module build; `mvn -B verify` compiles shared contracts and consuming services.
- **JUnit, Spring test support and Testcontainers:** unit, HTTP, startup, Kafka and
  PostgreSQL integration checks. Docker-dependent checks may be skipped if Docker is
  unavailable; inspect the summary instead of assuming every test ran.
- **Node test runner:** `npm test` checks adapters, validation, sentiment, watchlists
  and local HTTP/SSE behavior. TypeScript tests use Node's experimental type stripping.
- **ESLint and Next/TypeScript:** `npm run lint` checks web sources; `npm run build`
  performs production compilation and type checking.
- **pytest:** offline model/evaluation checks, installed with `ml/requirements-dev.txt`.
- **GitHub Actions:** Java, web, ML and license jobs on pushes and PRs. The license
  job's Node version is configured separately from the web job.
- **License gate:** `scripts/license-gate.sh` inspects npm, Maven and installed Python
  dependencies against the project policy and allow-list.

The [Dockerfile](../Dockerfile) builds each Java app in a Maven/Temurin 21 stage,
then runs it with a Temurin 21 JRE as a non-root user. Compose supplies the Java
backend, Kafka and PostgreSQL. The web app is started separately with npm.

Kafka retains events between components; PostgreSQL holds delivery state and query
models; Java processes event-time windows independently of browser sessions; Node
serves context without waiting for the risk pipeline; Python evaluates candidates
without replacing the active scorer. The [architecture guide](architecture.md)
explains how these boundaries affect configuration and user-visible data.
