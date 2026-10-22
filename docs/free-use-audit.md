# Free-use audit

Audit of whether every dependency, data source and model in Pumpwatch is free to use, for a non-commercial portfolio project. Done on 2026-10-22. This is a record of what was checked and what could not be, not legal advice. Anything marked unverified must be read from the official terms before it is relied on.

## Result in one line

Everything can run at no cost for a non-commercial portfolio project, but four things need care: social data terms (and the fact that free sources give no historical social data to train on), one model that must not be used, a market-data plan that covers only a small live watchlist, and several terms that could not be read from official pages.

## Web app packages (verified from the lockfile)

| Item | License | Notes |
| --- | --- | --- |
| next, react, react-dom, lenis | MIT | Free. |
| tailwindcss and build tooling | MIT, Apache-2.0 | Free. |
| gsap (with ScrollTrigger, SplitText, MotionPath) | GSAP "Standard no charge" license | Free for commercial use. A prohibited-use clause targets tools that compete with Webflow's visual animation builder, which does not apply here. Verified from the vendor's announcement and license page in search results. |
| sharp-libvips (optional, pulled in by Next) | LGPL-3.0 | Optional, dynamically linked and unused because the site uses no image optimizer. Fine. |
| caniuse-lite | CC-BY-4.0 | Data used by build tooling, attribution only. Fine. |
| Fonts (Instrument Sans, JetBrains Mono) | SIL Open Font License | Self-hosted by Next. Free. Not re-verified in this audit. |
| Vanta, three.js | MIT | Removed from the project. |

## Data sources

| Source | Free plan | Verified how | Caveats |
| --- | --- | --- | --- |
| SEC EDGAR | Free | Official page: 10 requests per second, descriptive User-Agent required, automated crawling outside policy is managed | Stay well under the limit. |
| Alpaca market data | Free plan: IEX only, 30 live symbols, historical limited to data older than 15 minutes, 200 calls per minute | Official docs page | Volume is understated because it is one venue. Whether the news API is on the free plan was not stated on any official page read. The news data comes from a third-party provider and redistribution terms were not stated. Unverified. |
| Finnhub | Free key, 60 calls per minute reported | Third-party sources only. The official pricing and documentation pages returned no plan details. | Reported as personal and non-commercial. Unverified. |
| Reddit data API | Free tier reported for non-commercial use, about 100 queries per minute with OAuth | Third-party sources only. The official terms pages were not reachable (blocked). | Reported rules: new API tokens need approval, scraping needs prior written consent, training a model on Reddit content needs the rightsholders' permission, and commercial use needs a contract. Treat as live-scoring only, keep its content out of training data, store derived data only and do not redistribute. Unverified. |
| X (Twitter) API | Reported as paid, pay-per-use since February 2026 | Third-party sources only | Not free. Disabled by default. |
| StockTwits API | Unclear | Directory sites only | Whether new developers can register in 2026 could not be confirmed. Check the official developer page. |
| Bluesky Jetstream | Free public firehose, no login | Third-party sources | The feed is not an official part of the protocol and may change. No rate or terms text was found. The finance audience is small. |
| Press-release feeds | Free public feeds | Not checked in this audit | Check each feed's terms and rate behavior before use. |

## Models

| Model | License | Decision |
| --- | --- | --- |
| ProsusAI/finbert | CC BY-NC-SA 4.0 (verified on the model page) | Do not use. Non-commercial and share-alike, so it is not free to use in general. |
| sentence-transformers/all-MiniLM-L6-v2 | Apache-2.0 (verified on the model page) | Use for embeddings. |
| LightGBM, scikit-learn, ONNX Runtime | MIT, BSD, MIT | Use. Standard licenses, not re-verified in this audit. |
| Claude or other paid model APIs | Paid | Not used in the project, to stay free. |

## Infrastructure

| Item | Cost | Note |
| --- | --- | --- |
| Kafka, Postgres, Spring Boot | Open source (Apache-2.0, PostgreSQL license) | Free. Not re-verified in this audit. |
| Docker | Free for personal use and small business | Fine for this project. |
| GitHub, GitHub Actions | Free for public repositories | Fine. |
| Terraform | Source-available license (BSL), allows non-competing use | Prefer OpenTofu, which is open source. |
| LocalStack | Student plan is free | Local rehearsal only. |
| AWS EC2 | Costs money unless covered by a free allowance or credits | One small instance for a few hours. Use a budget alarm and destroy after the proof run. |

## Actions

1. Read the official terms for Reddit, Finnhub and Alpaca's news product before relying on them, and record the date in `data-sources.md`.
2. Keep to derived data for social content and show no raw posts publicly.
3. Do not use FinBERT. Use an Apache-2.0 embedding model instead.
4. Keep the watchlist at or below 30 symbols on the free market-data plan.
5. Add the license gate and the source register as CI checks (see `add-compliance-guardrails`).
