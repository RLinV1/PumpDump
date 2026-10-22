# Design

## Context

Two ingestion changes already specify the raw topics (`raw-posts`, `ticks`, `raw-news`, `raw-filings`, `ingest-dlq`) and a recorder and replayer. This design adds everything after the raw topics. See proposal.md for why one shared design is needed.

Constraints that shape it:
- Everything must run at no cost for a non-commercial portfolio project (see `add-compliance-guardrails`). That caps the watchlist at the market-data plan's stream limit, so the system is small enough for one machine.
- The scorer is a trained model that does not exist yet. The architecture must work with a transparent rule-based scorer first, so the pipeline can be built and tested before any model is trained.

## Goals / Non-Goals

**Goals:**
- One data path for live and replay, so replay is a real test of live behavior.
- A scorer that can be swapped for a new model version without touching other stages.
- Flags that carry their own evidence.

**Non-Goals:**
- Horizontal scale beyond a single node, multi-tenant accounts, trading or broker connections, personalised advice.

## Decisions

**Data flow.**

```
connectors -> raw topics (Kafka) -> extractor (ticker linking, dedup)
  -> feature-builder (windowed features per ticker) -> features topic
  -> scorer (model or rules) -> scores topic
  -> flagger (level, cooldown, evidence) -> flags topic
  -> api (REST + SSE) -> web app, alert webhooks
recorder: every topic -> Postgres (event time indexed)
```

Each arrow is a Kafka topic keyed by ticker, so per-ticker order holds end to end and any stage can be rerun from its input topic. Alternative: calling stages directly in one process. Rejected because replay and debugging need the topic boundaries.

**Stream processing.** Spring Boot services using Kafka Streams for windows and joins, with event-time semantics and a two-minute grace period. Alternative: Flink. Rejected as too heavy to operate for one node; Kafka Streams is a library and needs no extra cluster.

**Feature store.** The feature-builder writes each window's features to the `features` topic and to a Postgres table. The same table is what training reads, so training and serving see identical features. Alternative: a separate feature store product. Rejected as unnecessary at this size.

**Training is offline, in Python, and never in the hot path.** A training job reads recorded features and labels, trains a gradient-boosted model, exports it to ONNX, and writes a versioned model file plus a model card. Alternative: serving the Python model over HTTP. Rejected for the hot path because it adds a second runtime and network hop; kept as a fallback if ONNX export of a feature proves hard.

**Scoring runs the ONNX model inside the JVM** with ONNX Runtime, behind a `Scorer` interface with two implementations: `RuleScorer` (always available, transparent) and `OnnxScorer`. The flag records which one produced it. If the model file is missing or fails its self-check, the system falls back to rules and says so.

**Explanations are computed by feature-group occlusion**: re-score with one group (social, market, catalyst) reset to its baseline and report the drop. It is model-agnostic and cheap with three groups. Alternative: SHAP at serving time. Rejected because exporting tree contributions through ONNX is awkward.

**Storage.** Kafka for streams, Postgres for recorded events, features, scores and flags. TimescaleDB is optional and free, and only worth adding if query speed on time ranges becomes a problem.

**Timing.** Windows of 1, 5 and 30 minutes, emitted every 15 seconds. That is the floor for the 60-second flag latency target.

**Replay isolation.** Replayed records carry a run id and go to topics with a run prefix by default, so a replay never pollutes live flags. The API can read a run by id.

## Risks / Trade-offs

- [Labels are scarce, so a model may not clearly beat rules] → Ship the rule scorer first, report honest metrics with confidence intervals, and only promote a model that beats the rules on a held-out period.
- [The free market-data tier covers about 30 live symbols and uses one venue, so volume is understated] → Document it, keep the watchlist small, and make the feed configurable so a better one can be swapped in.
- [Event-time windows with late data are easy to get subtly wrong] → The replay-parity test is the guard: any divergence between live and replay fails the build.
- [One node is a single point of failure] → Acceptable for a portfolio system. State it, and rely on replay to recover.
