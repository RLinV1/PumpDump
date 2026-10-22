# Design

## Context

Greenfield project; nothing exists yet. See proposal.md for motivation. Later changes add ticker extraction, an ML scorer that combines social features with Alpaca price and volume features, and an alert app. This change must therefore leave two clean, replayable, event-time-stamped streams.

Constraints: Java 21, Spring Boot, Kafka, Postgres; Alpaca free tier (IEX feed, capped stream symbols); Reddit API is OAuth and rate limited.

## Goals / Non-Goals

**Goals:**
- Two normalized topics (raw posts, ticks) plus a dead-letter topic.
- Replay that reuses the exact live topics and formats.
- Connectors that survive restarts, throttling, stream drops and broker outages without silent loss.

**Non-Goals:**
- Ticker extraction, scoring, alerts, UI.
- Schema registry and Avro (JSON envelope with a version field for now).
- Scrapers for sites without an official API or feed.

## Decisions

**Maven multi-module layout.** `common` (record types, topic names), `connectors` (Reddit and Alpaca, one Spring Boot app), `replay` (recorder and replayer, one Spring Boot app). Shared records live in `common` so later modules depend on one definition. Alternative: a single module; rejected because replay and connectors will scale and deploy independently.

**Topics and keys.** `raw-posts` keyed by `source:postId`; `ticks` keyed by ticker so per-ticker order holds; `ingest-dlq` for rejects. Ticker-keyed ticks let the later scorer join by ticker without repartitioning if the post stream is re-keyed by ticker after extraction. Partition count 6 locally, configurable.

**JSON envelope with version field.** Every record carries `schemaVersion`, `eventTime`, `ingestTime` and, for replayed records, `replayRunId` in a header. Alternative: Avro with a registry; deferred to avoid infrastructure before the record shapes settle.

**Duplicate suppression via Postgres.** A `seen_posts(source, post_id)` table with a unique key; insert-on-conflict-do-nothing decides whether to publish. Survives restarts, unlike an in-memory set. Alternative: rely on the compacted raw-posts topic only; rejected because consumers would still see duplicates before compaction.

**Producer settings.** Idempotent producer, `acks=all`, bounded retries. A bounded in-memory buffer sits in front; when full, the connector stops fetching and reports unhealthy rather than dropping records.

**Alpaca access.** Use Alpaca's WebSocket stream for live trades and its REST historical trades endpoint for gap fill after reconnect and for optional backfill. Use the JDK `HttpClient` and `WebSocket` directly instead of a community client, to control reconnect and backpressure. Credentials via environment variables.

**Reddit access.** Official OAuth API, polling `new` listings per subreddit on a configured interval, honoring rate-limit headers.

**Recorder and replayer.** The recorder is a Kafka consumer that writes each record to a Postgres table (`recorded_events`: topic, key, event time, payload) indexed by event time. The replayer reads a time range ordered by event time, sleeps for the scaled gap between records, and publishes to the live topics with a replay header. Shortcut: Postgres is fine for development-scale volume; move to Parquet files in object storage if recorded volume outgrows it.

**Observability.** Spring Boot Actuator health plus Micrometer counters (published, deduplicated, dead-lettered, lag since last fetch), exposed for Prometheus.

## Risks / Trade-offs

- [Alpaca free tier limits stream symbols and uses IEX volume, which understates true volume] → Keep the watchlist small, document the volume caveat, and make the feed configurable so a paid feed can be swapped in.
- [Reddit API terms or limits change, or posts are deleted] → Store raw payloads, treat deletions as data (not errors), and keep replay data so demos do not depend on live access.
- [Replay and live share topics, so a replay can pollute live consumers] → Replay marker header and a separate replay mode flag consumers can filter on; also support replay into a differently named topic prefix for isolated tests.
- [Recorder in Postgres becomes the bottleneck at high tick rates] → Batch inserts; measure; escape hatch is the Parquet shortcut above.
- [Exactly-once is not guaranteed end to end] → At-least-once delivery with idempotent keys; downstream stages dedupe by record key.
