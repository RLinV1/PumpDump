# Resources needed

Everything you need to build and run Pumpwatch, grouped by what it is, with the cost for a non-commercial portfolio project. Costs and limits were checked on 2026-10-22; see `free-use-audit.md` for the evidence and for what is still unverified.

## Accounts and keys

| Resource | Needed for | Cost | Notes |
| --- | --- | --- | --- |
| GitHub account | Code, pull requests, CI | Free | Already in use. |
| Alpaca account (a free paper-trading account is enough for data keys) | Live trades and historical bars | Free plan | IEX only, 30 live symbols, historical data older than 15 minutes, 200 calls per minute. Opening an account needs an email address; a funded live account is not needed for data. |
| Finnhub API key (`FINNHUB_TOKEN`) | Company and market news | Free key (reported 60 calls per minute) | Terms unverified. Reported as personal and non-commercial. Optional; off by default (`FINNHUB_ENABLED`). |
| SEC EDGAR (`SEC_USER_AGENT`) | 8-K filings | Free, no key | Send a descriptive User-Agent with a contact email. Stay under 10 requests per second. |
| Alpaca News and press-release RSS (`ALPACA_NEWS_ENABLED`, `RSS_ENABLED`, `RSS_FEEDS`) | More news sources | Free | Same Alpaca keys as above. Both are off until their storage terms are verified (`sources.md`). |
| Google Gemini API key (`GEMINI_API_KEY`) | The private research assistant in `research/` | Free tier key from Google AI Studio | Optional. Without it the assistant uses the labelled mock agent. Local use only: never put it in the public VM, Vercel or a `NEXT_PUBLIC_*` variable. |
| Hugging Face (no account) | Downloading the sentiment models on first run | Free | Pinned public repos; see Machine learning resources. No token is needed. |
| A social data source | Chatter features | See the table below | The hardest resource to get right. |
| Google Cloud account (owner only) | The public mock-data VM in `infra/` and `docs/operations/gcp.md` | Costs money unless covered by credits | Owner only. The agent never runs `terraform apply` or creates cloud resources. |
| Vercel account (owner only) | Hosting the web app | Free hobby plan | Owner only: sign in to Vercel yourself. The deployment carries no Alpaca or Gemini key. |
| Chat webhook URL (`ALERTS_WEBHOOK_URLS`; Slack or Discord) | Alerts | Free | Create it yourself. Keep the URL secret, in `.env` only. Alerts are off by default. |

## Social data sources

| Source | Free? | Fit for this project |
| --- | --- | --- |
| Reddit Data API | Free tier reported for non-commercial use, about 100 queries per minute with OAuth | Needs an approved app. Reported rules: no scraping without consent, no training models on its content without rightsholder permission, commercial use needs a contract. Use for live scoring features only, and do not put its content in training data. Official terms were not readable during the audit, so this is unverified. |
| Bluesky Jetstream (public firehose, `BLUESKY_ENABLED`) | Free, no login | Easy and open, but the finance audience is small. No rate or terms text was found. Good for a working pipeline and for collecting your own data over time. |
| X (Twitter) API | Paid. Reported as pay-per-use since February 2026 with no free reading | Not free. Disabled by default. |
| StockTwits API | Unclear. Registration status in 2026 could not be confirmed | Check the official developer page before planning around it. |
| Scraping websites | Not allowed by most terms | Do not scrape. |

## Hardware and local tools

| Resource | Needed for | Notes |
| --- | --- | --- |
| A laptop with 16 GB of memory | Running Kafka, Postgres and the services together | 8 GB is tight. Use container memory limits. |
| About 20 GB of free disk | Recorded events, features and model files | Grows with recording time. |
| Docker with Compose v2 | Kafka 3.9.1 (KRaft), Postgres 17, and the optional `apps` profile | Free for personal use. Tests with Testcontainers also need it. |
| Java 21 and Maven 3.9+ | Connectors, replay, pipeline, API | Free. |
| Node 22.13+ and npm | The web app, the sentiment model fetch script | Free. |
| Python 3.12+ with `pip` | Training and evaluation in `ml/` | Free. |
| Python 3.13 with `uv` | Stock research service in `research/` (yfinance, FastAPI, chromadb, google-genai) and its tests | Free. |
| Git | Branches and pull requests | Free. |
| OpenTofu (or Terraform) | The cloud deployments in `infra/` | OpenTofu is open source. Owner runs `apply`. |
| `gcloud` and `ssh` | `deploy/up.sh` to the VM | Owner only. |
| `k6` (or Docker) | The load test in `load/` | Optional. |

## Machine learning resources

| Resource | Needed for | License |
| --- | --- | --- |
| LightGBM | The main classifier | MIT |
| scikit-learn | Calibration, baselines, anomaly detection, evaluation | BSD |
| ONNX Runtime (Java, in `pipeline/`), and `onnx`, `onnxmltools`, `skl2onnx` plus `onnxruntime` for checks in `ml/` | Serving the pump model inside the JVM; the scorer falls back to rules when no model directory is set | MIT |
| `sentence-transformers/all-MiniLM-L6-v2` | Text embeddings for the promotional-language feature | Apache-2.0 |
| `kingsman34/FinTwitBERT-sentiment-ONNX` (Hugging Face, pinned revision) | Bluesky post sentiment in the web server (`web/scripts/fetch-sentiment-model.mjs`) | Check the repo card |
| `Xenova/twitter-roberta-base-irony` (pinned) | Irony check on social sentiment | Check the repo card |
| `Xenova/distilroberta-finetuned-financial-news-sentiment-analysis` (pinned) | News headline sentiment | Check the repo card |
| Gemini model (`GEMINI_MODEL`) | The research assistant, via the Gemini API | API terms |
| A CPU only | All training and model serving | No GPU is needed. The sentiment models download once into a local cache (a few hundred MB) and need `SENTIMENT_ENABLED` / `NEWS_SENTIMENT_ENABLED` to run. |

Do not use `ProsusAI/finbert`: its license is CC BY-NC-SA 4.0 (non-commercial, share-alike).

## Labeled data

| Resource | Needed for | Notes |
| --- | --- | --- |
| SEC litigation releases and trading suspensions | Confirmed pump episodes | Public. Each episode needs its source URL. |
| Historical bars (Alpaca) and, for the research service, Yahoo Finance data via `yfinance` | Prices for lookup | Real data stays on the owner's machine; the public VM uses labelled mock data (`RESEARCH_USE_MOCK_DATA=1`). |
| Historical bars and filings | Market and catalyst features for past episodes | Free from Alpaca (older than 15 minutes) and EDGAR. |
| Historical social data | Social features for past episodes | Not available for free. You must record live data going forward, so social features only exist from the day recording starts. |

## Time

The ML work is gated by data, not code. A first model on market and catalyst features can be trained once enough past episodes are labeled. A model that also uses social features needs weeks to months of your own recorded data.
