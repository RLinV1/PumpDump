# Proposal

## Why

Pumpwatch detects coordinated pump-and-dump activity by joining social chatter with market activity per ticker. Nothing can be scored, evaluated or demoed until both data streams reach one durable, replayable log. This change builds that foundation first, because every later capability (ticker extraction, scoring, alerts) consumes it.

## What Changes

- Add a Spring Boot (Java 21) multi-module Maven project named Pumpwatch.
- Add a Kafka-backed ingestion layer with three topics: raw social posts, market ticks, and a dead-letter topic for records that fail validation.
- Add a Reddit connector that polls selected finance subreddits through the official API and publishes normalized posts.
- Add a market-data connector that publishes normalized trade and quote ticks for a configurable watchlist from Alpaca (live stream plus historical bars and trades for backfill).
- Add a replay mode that re-publishes recorded raw records into the same topics at original or accelerated speed, so backtests and demos use the same code path as live data.
- Add a local docker-compose environment (Kafka, Postgres) and basic health and throughput metrics for every connector.
- Out of scope: ticker extraction, scoring, alerts, the web app, and any scraper for sites without an official API or feed (deferred to a later change).

## Capabilities

### New Capabilities
- `social-post-ingestion`: Fetch posts from social sources and publish them as normalized records to the raw-posts topic, with dedup and rate-limit handling.
- `market-tick-ingestion`: Fetch market ticks for a watchlist and publish them as normalized records to the ticks topic, keyed by ticker.
- `event-replay`: Record raw ingested events and re-publish them to the live topics at configurable speed, preserving original event time.
- `ingestion-reliability`: Common delivery behavior for all connectors: invalid records go to the dead-letter topic, connector failures do not lose data, and operators can see connector health.

### Modified Capabilities
<!-- None: this is the first change, no specs exist yet. -->

## Impact

- New code: Maven modules `common` (record schemas), `connectors`, `replay`, plus build and compose files.
- New dependencies: Spring Boot, Spring for Apache Kafka, Micrometer, a Reddit API client (HTTP), an Alpaca market-data client.
- External systems: Reddit API (OAuth, rate limited), Alpaca market data (free tier), Kafka, Postgres.
- Assumptions to confirm in week 1: Alpaca's free tier (IEX feed only, capped symbol count on the stream) covers the watchlist size and tick rate needed, and its terms permit storing recorded data for replay; Reddit API terms permit the intended read-only use.
