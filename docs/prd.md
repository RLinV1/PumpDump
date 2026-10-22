# Pumpwatch: Product Requirements

Status: draft 1. Owner: RLinV1. The detailed behavior lives in the OpenSpec changes under `openspec/changes/`; this document says what we are building, for whom, and how we will know it works.

## 1. Summary

Pumpwatch is a risk analytics tool for retail investors. It watches social chatter, news, company filings and live trades together, flags tickers that are moving on coordinated hype with no real catalyst (a pump and dump), and forecasts how far each ticker may swing over the next hour. Every flag comes with the evidence behind it.

It is also a portfolio project: a real-time, queue-based, multi-source system with machine learning, built to be explained and demonstrated.

## 2. Problem

Retail investors lose money to pump-and-dump schemes because the warning signs are scattered. The posts are on one site, the price move is on another, and whether there is real news behind the move takes minutes of manual searching, by which time the price has already turned. Existing tools show price alerts or raw social sentiment. None of them answer the two questions that matter: is this move hype or real, and how violent could it get.

## 3. Users

| User | Need | How they use it |
| --- | --- | --- |
| Retail investor | Avoid buying the top of a hype spike, and understand risk before acting | Watches a list of tickers, gets an alert, reads the evidence |
| Curious viewer or recruiter | Understand quickly what the system does and that it works | Opens the landing page, plays with the detector, reads the architecture |

Pumpwatch is not for professional traders, and it is not a trading tool.

## 4. Goals and non-goals

### Goals
1. Flag likely coordinated pumps early, with a stated reason and a stated absence of catalyst.
2. Forecast the next-hour size of move for each watched ticker, with honest uncertainty.
3. Show the evidence for every flag so a user can judge it themselves.
4. Be reproducible: replaying a recorded day gives the same flags.
5. Cost nothing to run for a non-commercial project.

### Non-goals
- Telling anyone to buy or sell, predicting price direction, or giving personalized financial advice.
- Executing trades or connecting to a broker.
- Covering the whole market. The live scope is a small watchlist.
- Being the fastest alerting product. The target is a minute, not a millisecond.

## 5. Success metrics

| Metric | Target |
| --- | --- |
| Flag latency from first evidence to flag | 60 seconds or less at the 95th percentile |
| Replay parity | Two replays of one recorded day give identical flags |
| Pump model against the rule baseline | Beats both the rule score and a chatter-volume-only score on a time-based split, or the rule score stays in service and the report says so |
| False flags on normal days | Reported with a confidence interval, and under a threshold set during evaluation |
| Volatility forecast | Beats the HAR baseline in both a calm and a stressed period, and the upper band covers the realized range at about its stated rate |
| Landing page | Loads fast, no layout jank, works on phone and in landscape, every number labeled simulated |
| Cost | Zero for data, tooling and models |

## 6. Features

### Release 1: the detection pipeline (must have)
- Ingest live trades, news, SEC filings and at least one social source for a small watchlist.
- Link posts to tickers and build windowed features over 1, 5 and 30 minutes.
- Score each ticker with a rule-based scorer first, then a trained model, with the rule scorer always available as a fallback.
- Treat real catalysts as a one-way brake: evidence of news or a filing can only lower the pump score.
- Emit a flag with its score, model version, top contributors, post and trade counts, and the catalyst check result.
- De-duplicate flags with a per-ticker cooldown.
- Record everything with event time so any day can be replayed.

### Release 2: risk view (must have)
- Next-hour swing forecast (median and upper band) and a regime label (calm, elevated, extreme) against the ticker's own history.
- A live web view: ticker list, chart, evidence panel, flag history.
- A REST and live-stream API for scores and flags.
- Alerts for watched tickers.

### Release 3: depth (nice to have, chosen later)
- Backtesting engine with walk-forward evaluation.
- Coordinated-account detection from a graph of accounts, posts and tickers.
- Portfolio risk view with holdings kept in the browser only.
- Replay mode that scrubs through a past episode on the real chart.
- Model registry, drift monitoring and scheduled retraining.
- Observability dashboards.

### Already built
- The marketing and demo landing page (`web/`): a simulated candlestick screen with an evidence panel, a scroll story of how a pump unfolds, an interactive detector, and a three.js background. All figures on it are invented and labeled as such.

## 7. How it works

```
social, trades, news, filings -> Kafka raw topics -> extractor -> feature-builder -> scorer -> flagger -> API (REST and SSE) -> web
                                          \-> recorder and replayer (Postgres)
```

- Java and Spring Boot services connected by Kafka topics, keyed by ticker.
- Event-time windows with a two-minute grace period for late data.
- Postgres stores raw events, features, scores and flags.
- The pump model is a gradient-boosted classifier (LightGBM) with a monotone constraint on catalyst evidence, calibrated, exported to ONNX and served in the JVM. A rule scorer and an anomaly baseline cover the period before labels exist.
- The volatility model is a LightGBM quantile regressor, with a HAR-RV baseline it must beat.
- Flags are explained by occluding feature groups and measuring the score change.
- Next.js frontend with Tailwind, GSAP, Lenis and three.js.

## 8. Data and constraints

- Sources: Alpaca (free plan, small live watchlist), SEC EDGAR (10 requests per second with a User-Agent), Finnhub, press-release feeds, and social sources whose terms allow the use. Reddit, Finnhub and Alpaca news terms are unverified and recorded as such in `docs/free-use-audit.md`.
- Free sources give no historical social data, so version 1 of the model trains on market and catalyst features. Social features are recorded from day one and join a later model version.
- Sources that forbid training on their content feed live scoring only and stay out of every training set.
- Models with non-commercial licenses are excluded.

## 9. Non-functional requirements

- Reliability: a stalled source marks scores stale and scoring continues.
- Determinism: replay parity is tested.
- Explainability: no flag without evidence.
- Privacy: portfolio holdings never leave the browser. Only derived social data is stored.
- Accessibility and performance: the web app works with reduced motion, on phones and in landscape, and heavy visuals load after first paint and pause when offscreen.
- Safety: every surface carries the not-investment-advice notice, and forecasts never carry a direction cue.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Too few labeled pump episodes to train or test | Ship the rule scorer and say so plainly; widen the label search; use synthetic episodes only for tests |
| Social terms change or access is blocked | Source registry with per-source permissions; disable by default when unconfirmed |
| Model looks good only by leakage | Time-based split, episodes kept whole, baselines to beat, promotion gate |
| Users read a flag as advice | Notice on every surface, wording reviewed, no direction cues |
| Scope grows past what one person can finish | Release 1 and 2 are the commitment; Release 3 items are chosen one at a time |

## 11. Milestones

1. Project skeleton: shared contracts, Docker Compose with Kafka and Postgres. Milestones M1 to M8 and their tickets are listed in `docs/roadmap.md`.
2. Ingestion and replay.
3. Pipeline with the rule scorer, proven by one recorded synthetic day that yields exactly one flag.
4. Labels, the first trained pump model, and the evaluation gate.
5. Volatility baseline, then the trained forecaster.
6. API, alerts and the live web view.
7. One-off EC2 smoke test.
8. Release 3 items, one at a time.

## 12. Open questions

- Which social source is allowed and sustainable for live use?
- How many labeled episodes can public enforcement data actually provide?
- Which watchlist size fits the Alpaca free plan comfortably?
- Does the project stay private, or go public with a hosted demo?
