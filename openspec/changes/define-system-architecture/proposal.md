# Proposal

## Why

Pumpwatch now has two ingestion changes (`add-ingestion-pipeline`, `add-news-ingestion`) but nothing that says how those streams become a detection, an alert and a page. Without one shared description of the whole system, each later change will invent its own topics, timing rules and failure behavior, and they will not fit together. This change defines the end-to-end behavior and the architecture the other changes plug into.

## What Changes

- Define the end-to-end detection pipeline: from a raw record to a flagged ticker with evidence.
- Fix the shared rules every stage must follow: event time, replay parity, latency target, explainable flags, flag de-duplication, failure isolation.
- Document the architecture: components, Kafka topics, stores, the offline training loop, and how a trained model reaches the live scorer.
- Set the milestone order and one cross-cutting integration test that replays a recorded historical pump and expects a flag.
- Out of scope: the individual stages themselves. They are specified in `add-pump-scoring-model`, `add-alerts-and-api`, `add-ec2-smoke-deployment` and `add-compliance-guardrails`.

## Capabilities

### New Capabilities
- `detection-pipeline`: The end-to-end behavior from raw events to an explained, de-duplicated flag, and the timing and failure rules every stage shares.

### Modified Capabilities
<!-- None: the earlier changes are not archived, so their capabilities are not in openspec/specs/. -->

## Impact

- Depends on `add-ingestion-pipeline` and `add-news-ingestion` for the raw topics and the recorder.
- Constrains `add-pump-scoring-model`, `add-alerts-and-api` and `add-ec2-smoke-deployment`, which must follow the topic names, event-time rule and flag contract defined here.
- No new runtime code in this change beyond the integration test and a shared module for topic names and the flag record.
