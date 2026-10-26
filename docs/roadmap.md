# Roadmap and milestones

Each milestone depends on the one before it. Every ticket is one task group from an OpenSpec change under `openspec/changes/`, tracked as a GitHub issue in the matching milestone. The task checklists live in each change's `tasks.md`; the issues only mirror them.

Tickets can also be imported into Jira from a CSV exported from these issues. The issue labels are the area (ingestion, pipeline, ml, api, web, infra, compliance).

## M7 API, alerts and live web

Done when: A real flag shows on the page, and the labeled simulation remains the fallback.

- [ ] [#4](https://github.com/RLinV1/PumpDump/issues/4) alerts and api: API
- [ ] [#5](https://github.com/RLinV1/PumpDump/issues/5) alerts and api: Alerts
- [ ] [#6](https://github.com/RLinV1/PumpDump/issues/6) alerts and api: Web
- [ ] [#12](https://github.com/RLinV1/PumpDump/issues/12) compliance guardrails: Notices
- [ ] [#40](https://github.com/RLinV1/PumpDump/issues/40) volatility forecasting: Surfaces

## M1 Skeleton and contracts

Done when: One command starts Kafka and Postgres, CI is green, and the license gate runs.

- [ ] [#7](https://github.com/RLinV1/PumpDump/issues/7) compliance guardrails: Register and audit
- [ ] [#8](https://github.com/RLinV1/PumpDump/issues/8) compliance guardrails: Free-tier defaults
- [ ] [#11](https://github.com/RLinV1/PumpDump/issues/11) compliance guardrails: License gate
- [ ] [#17](https://github.com/RLinV1/PumpDump/issues/17) ingestion pipeline: Project setup
- [ ] [#18](https://github.com/RLinV1/PumpDump/issues/18) ingestion pipeline: Common records
- [ ] [#41](https://github.com/RLinV1/PumpDump/issues/41) define system architecture: Shared contracts

## M2 Ingestion and replay

Done when: Live trades and social posts flow reliably, and a recorded hour replays at 10x.

- [ ] [#9](https://github.com/RLinV1/PumpDump/issues/9) compliance guardrails: Rate limits and identification
- [ ] [#19](https://github.com/RLinV1/PumpDump/issues/19) ingestion pipeline: Ingestion reliability
- [ ] [#20](https://github.com/RLinV1/PumpDump/issues/20) ingestion pipeline: Social post ingestion (Reddit)
- [ ] [#21](https://github.com/RLinV1/PumpDump/issues/21) ingestion pipeline: Market tick ingestion (Alpaca)
- [ ] [#22](https://github.com/RLinV1/PumpDump/issues/22) ingestion pipeline: Recording and replay
- [ ] [#23](https://github.com/RLinV1/PumpDump/issues/23) ingestion pipeline: Week-1 checks and wrap-up

## M4 Rules pipeline end to end

Done when: One recorded synthetic day yields exactly one flag, and the replay and parity tests pass.

- [ ] [#10](https://github.com/RLinV1/PumpDump/issues/10) compliance guardrails: Storage and public output
- [ ] [#31](https://github.com/RLinV1/PumpDump/issues/31) pump scoring model: Ticker linking and social features
- [ ] [#32](https://github.com/RLinV1/PumpDump/issues/32) pump scoring model: Market and catalyst features
- [ ] [#33](https://github.com/RLinV1/PumpDump/issues/33) pump scoring model: Rule scorer and plumbing
- [ ] [#42](https://github.com/RLinV1/PumpDump/issues/42) define system architecture: Pipeline skeleton
- [ ] [#43](https://github.com/RLinV1/PumpDump/issues/43) define system architecture: Cross-cutting behavior
- [ ] [#44](https://github.com/RLinV1/PumpDump/issues/44) define system architecture: Proof

## M8 Cloud smoke test

Done when: The one-off proof report exists and the cloud account is clean.

- [ ] [#13](https://github.com/RLinV1/PumpDump/issues/13) ec2 smoke deployment: Infrastructure code
- [ ] [#14](https://github.com/RLinV1/PumpDump/issues/14) ec2 smoke deployment: Secrets and health
- [ ] [#15](https://github.com/RLinV1/PumpDump/issues/15) ec2 smoke deployment: Rehearsal
- [ ] [#16](https://github.com/RLinV1/PumpDump/issues/16) ec2 smoke deployment: Proof run

## M3 News and filings

Done when: News and 8-K filings are ingested, recorded and replayable.

- [ ] [#24](https://github.com/RLinV1/PumpDump/issues/24) news ingestion: Common records and topics
- [ ] [#25](https://github.com/RLinV1/PumpDump/issues/25) news ingestion: Connector framework
- [ ] [#26](https://github.com/RLinV1/PumpDump/issues/26) news ingestion: Alpaca News
- [ ] [#27](https://github.com/RLinV1/PumpDump/issues/27) news ingestion: SEC EDGAR 8-K
- [ ] [#28](https://github.com/RLinV1/PumpDump/issues/28) news ingestion: Finnhub
- [ ] [#29](https://github.com/RLinV1/PumpDump/issues/29) news ingestion: Press-release RSS
- [ ] [#30](https://github.com/RLinV1/PumpDump/issues/30) news ingestion: Recording, cross-source behavior and wrap-up

## M5 Labels and first model

Done when: The dataset is built, the first model is trained and served with rule fallback, and the promotion gate decision is recorded.

- [ ] [#34](https://github.com/RLinV1/PumpDump/issues/34) pump scoring model: Labeled dataset
- [ ] [#35](https://github.com/RLinV1/PumpDump/issues/35) pump scoring model: Training and evaluation (`ml/`)
- [ ] [#36](https://github.com/RLinV1/PumpDump/issues/36) pump scoring model: Serving

## M6 Volatility forecast

Done when: The baseline and the trained forecaster are evaluated in a calm and a stressed period, and the gate decision is recorded.

- [ ] [#37](https://github.com/RLinV1/PumpDump/issues/37) volatility forecasting: Data and baseline
- [ ] [#38](https://github.com/RLinV1/PumpDump/issues/38) volatility forecasting: Model
- [ ] [#39](https://github.com/RLinV1/PumpDump/issues/39) volatility forecasting: Evaluation

## Order of work

1. M1 and M2 are the first real build: the stack, then reliable ingestion and replay.
2. M3 adds the catalyst signal the scorer depends on.
3. M4 proves the whole path with rules only, before any model exists.
4. M5 and M6 add the learned models, each behind a promotion gate that can keep the rules or the baseline in service.
5. M7 connects the pipeline to the landing page.
6. M8 is the single cloud proof run, ended by a destroy step.
