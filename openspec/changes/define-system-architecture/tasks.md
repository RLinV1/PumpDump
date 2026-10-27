## 1. Shared contracts

- [x] 1.1 Add a `common` module with topic names, key rules (ticker), and the `Features`, `Score` and `Flag` record types with a schema version
- [x] 1.2 Define the flag evidence structure (score, model version, top contributors, post and trade counts, catalyst lookback result)
- [x] 1.3 Add a run-id header and topic-prefix convention for replay isolation

- [ ] 1.4 Keep `docs/resources-needed.md` current with every account, key, tool, machine, model and dataset a milestone needs

## 2. Pipeline skeleton

- [ ] 2.1 Add `extractor`, `feature-builder`, `scorer` and `flagger` Spring Boot modules wired through Kafka topics, each reading and writing the shared records
- [ ] 2.2 Configure event-time windows (1, 5, 30 minutes, emitted every 15 seconds) with a two-minute grace period
- [ ] 2.3 Implement the `Scorer` interface with a `RuleScorer` so the whole path runs before any model exists
- [ ] 2.4 Implement flag de-duplication with a per-ticker cooldown and a re-flag margin
- [ ] 2.5 Extend the recorder to store features, scores and flags with event time

## 3. Cross-cutting behavior

- [ ] 3.1 Add stale-source markers to scores when a connector reports unhealthy
- [ ] 3.2 Add late-data metrics and a metric for flag latency
- [ ] 3.3 Add the feature-group occlusion explainer that produces the evidence contributors

## 4. Proof

- [ ] 4.1 Record a short synthetic day containing one pump-shaped episode and one news-backed move
- [ ] 4.2 Integration test: replay the recorded day and assert exactly one flag, on the pump, with evidence stating no catalyst
- [ ] 4.3 Replay-parity test: run the same day twice and assert identical flags
- [ ] 4.4 Failure test: stop the social connector mid-day and assert scoring continues with stale markers

## 5. Milestones

- [ ] 5.1 Order of work: ingestion changes, then the pipeline skeleton with rules, then labels and the first model, then the API and alerts, then web integration, then the one-off cloud smoke test
- [ ] 5.2 Record the milestone status in the README after each is merged, following `docs/roadmap.md`
