# Resources needed

Everything you need to build and run Pumpwatch, grouped by what it is, with the cost for a non-commercial portfolio project. Costs and limits were checked on 2026-10-22; see `free-use-audit.md` for the evidence and for what is still unverified.

## Accounts and keys

| Resource | Needed for | Cost | Notes |
| --- | --- | --- | --- |
| GitHub account | Code, pull requests, CI | Free | Already in use. |
| Alpaca account (a free paper-trading account is enough for data keys) | Live trades and historical bars | Free plan | IEX only, 30 live symbols, historical data older than 15 minutes, 200 calls per minute. Opening an account needs an email address; a funded live account is not needed for data. |
| Finnhub API key | Company and market news | Free key (reported 60 calls per minute) | Terms unverified. Reported as personal and non-commercial. |
| SEC EDGAR | 8-K filings | Free, no key | Send a descriptive User-Agent with a contact email. Stay under 10 requests per second. |
| A social data source | Chatter features | See the table below | The hardest resource to get right. |
| AWS account | One-off cloud test only | Costs money unless covered by credits | Set a budget alarm before creating anything. |
| LocalStack student license | Rehearsing the AWS setup locally | Free for students | Optional. |
| Chat webhook URL (for example a Discord channel webhook) | Alerts | Free | Keep the URL secret. |

## Social data sources

| Source | Free? | Fit for this project |
| --- | --- | --- |
| Reddit Data API | Free tier reported for non-commercial use, about 100 queries per minute with OAuth | Needs an approved app. Reported rules: no scraping without consent, no training models on its content without rightsholder permission, commercial use needs a contract. Use for live scoring features only, and do not put its content in training data. Official terms were not readable during the audit, so this is unverified. |
| Bluesky Jetstream (public firehose) | Free, no login | Easy and open, but the finance audience is small. No rate or terms text was found. Good for a working pipeline and for collecting your own data over time. |
| X (Twitter) API | Paid. Reported as pay-per-use since February 2026 with no free reading | Not free. Disabled by default. |
| StockTwits API | Unclear. Registration status in 2026 could not be confirmed | Check the official developer page before planning around it. |
| Scraping websites | Not allowed by most terms | Do not scrape. |

## Hardware and local tools

| Resource | Needed for | Notes |
| --- | --- | --- |
| A laptop with 16 GB of memory | Running Kafka, Postgres and the services together | 8 GB is tight. Use container memory limits. |
| About 20 GB of free disk | Recorded events, features and model files | Grows with recording time. |
| Docker | Local infrastructure | Free for personal use. |
| Java 21 and Maven | Connectors, stream stages, scorer, API | Free. |
| Node 22 and npm | The web app | Free. |
| Python 3.11 with `uv` or `pip` | Training and evaluation in `ml/` | Free. |
| Git | Branches and pull requests | Free. |
| OpenTofu (or Terraform) | The one-off cloud test | OpenTofu is open source. |

## Machine learning resources

| Resource | Needed for | License |
| --- | --- | --- |
| LightGBM | The main classifier | MIT |
| scikit-learn | Calibration, baselines, anomaly detection, evaluation | BSD |
| ONNX Runtime and onnxmltools | Serving the model inside the JVM | MIT |
| `sentence-transformers/all-MiniLM-L6-v2` | Text embeddings for the promotional-language feature | Apache-2.0 |
| A CPU only | All training | No GPU is needed. |

Do not use `ProsusAI/finbert`: its license is CC BY-NC-SA 4.0 (non-commercial, share-alike).

## Labeled data

| Resource | Needed for | Notes |
| --- | --- | --- |
| SEC litigation releases and trading suspensions | Confirmed pump episodes | Public. Each episode needs its source URL. |
| Historical bars and filings | Market and catalyst features for past episodes | Free from Alpaca (older than 15 minutes) and EDGAR. |
| Historical social data | Social features for past episodes | Not available for free. You must record live data going forward, so social features only exist from the day recording starts. |

## Time

The ML work is gated by data, not code. A first model on market and catalyst features can be trained once enough past episodes are labeled. A model that also uses social features needs weeks to months of your own recorded data.
