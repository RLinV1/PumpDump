# Pumpwatch documentation

Start with [architecture/containers.md](architecture/containers.md) to see how the Docker containers fit together.
Plans for new behaviour live in [`openspec/changes/`](../openspec/changes/), not here.

## Architecture

| Doc | What it is for |
| --- | --- |
| [containers.md](architecture/containers.md) | Docker containers, Kafka topics, Postgres use, ports, startup order, record/replay, mock vs live; one diagram |
| [overview.md](architecture/overview.md) | How the Java risk path and the Node web path work inside: windows, scoring, API, sentiment, routes, config |
| [research.md](architecture/research.md) | The private Python service: stock lookup, the Gemini/MCP/RAG flag assistant |
| [tech-stack.md](architecture/tech-stack.md) | Technologies, versions and what each does; repository layout |

## Data and compliance

| Doc | What it is for |
| --- | --- |
| [sources.md](data/sources.md) | Source register: plan, limit, terms link, verification status, whether enabled by default |
| [terms.md](data/terms.md) | Terms and rate-limit findings per news, filing and market-data source (drafts for the owner to confirm) |
| [free-use-audit.md](data/free-use-audit.md) | Evidence that each package, source and model is free to use for a non-commercial project |
| [resources.md](data/resources.md) | Accounts, keys, tools and machines needed, with cost |

## ML and scoring

| Doc | What it is for |
| --- | --- |
| [rule-scorer.md](ml/rule-scorer.md) | `rules-v1` thresholds and the anomaly baseline (checked by tests against the code) |
| [sentiment-evaluation-2026-11-06.md](ml/sentiment-evaluation-2026-11-06.md) | Sentiment and irony model comparison on the 46-case synthetic set, with retained errors |
| [model-vs-rules-synthetic-day.md](ml/model-vs-rules-synthetic-day.md) | Synthetic-day comparison of the fixture model against the rules (issue #36, task 6.4) |
| [../data/labels/DECISIONS.md](../data/labels/DECISIONS.md) | Labelled episodes: classes, sources, and the owner's labelling decisions |
| [../ml/README.md](../ml/README.md) | Python training and evaluation commands |
| [../ml/LIVE-SENTIMENT.md](../ml/LIVE-SENTIMENT.md) | Live sentiment model, matching rules, retention, limits |

## Operations

| Doc | What it is for |
| --- | --- |
| [handoff-2026-11-11.md](operations/handoff-2026-11-11.md) | Latest session handoff: what landed, open issues, unfinished work, gotchas |
| [local-setup.md](operations/local-setup.md) | Run the app locally, with or without Docker; the end-to-end news demo runbook |
| [gcp.md](operations/gcp.md) | Deploy the public mock-data VM on Google Cloud with Terraform |
| [load-test.md](operations/load-test.md) | k6 read-API and SSE load tests |
| [security-review.md](operations/security-review.md) | Security review of the public VM setup and open items |

## Product

| Doc | What it is for |
| --- | --- |
| [prd.md](product/prd.md) | Product requirements: problem, users, scope, success measures |
| [roadmap.md](product/roadmap.md) | Milestones M1 to M8 and their tickets |
| [walkthrough.md](product/walkthrough.md) | Screenshot tour of the UI (mock data) |
| [plans/2026-10-28-live-landing.md](plans/2026-10-28-live-landing.md) | Implementation plan for the live landing page (historical) |

## Reports (dated records)

These record what was checked on a given day. They are not kept up to date.

| Doc | What it is for |
| --- | --- |
| [verification-2026-10-29.md](reports/verification-2026-10-29.md) | First local live-mode verification (Alpaca, web, API); superseded by the later run |
| [verification-2026-11-06.md](reports/verification-2026-11-06.md) | Automated checks and results across Java, web and research |
| [performance-2026-11-06.md](reports/performance-2026-11-06.md) | Local performance and load results; raw JSON in `reports/performance/` |
| [code-review-2026-11-07.md](reports/code-review-2026-11-07.md) | Follow-up on 19 review findings; evals in `reports/review/` |
| [bug-fixes-and-ci-2026-11-08.md](reports/bug-fixes-and-ci-2026-11-08.md) | Bug fixes and CI cleanup after PR 78 |

Screenshots live in [img/](img/README.md).
