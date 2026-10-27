## 1. Project setup

- [x] 1.1 Create Maven parent with modules `common`, `connectors`, `replay` (Java 21, Spring Boot)
- [x] 1.2 Add docker-compose with Kafka and Postgres, plus a one-command start script and README section
- [x] 1.3 Add topic creation (`raw-posts`, `ticks`, `ingest-dlq`) with configurable partition count
- [x] 1.4 Add CI workflow that builds and runs unit tests

## 2. Common records

- [x] 2.1 Define `PostRecord`, `TickRecord`, and dead-letter record types with `schemaVersion` and event/ingest times
- [x] 2.2 Add JSON serialization and validation (required fields) with unit tests
- [x] 2.3 Add shared topic-name and header constants (replay marker, replay run id)

## 3. Ingestion reliability

- [ ] 3.1 Configure idempotent, `acks=all` producer with bounded retries
- [ ] 3.2 Implement bounded buffer that pauses fetching when full and flips health to unhealthy
- [ ] 3.3 Implement dead-letter publishing with reason and original payload
- [ ] 3.4 Expose Actuator health and Micrometer metrics per connector (published/s, dead-letter count, last fetch age)
- [ ] 3.5 Test: broker down for 30s loses no records; buffer-full path reports unhealthy

## 4. Social post ingestion (Reddit)

- [ ] 4.1 Implement OAuth token handling and polling of configured subreddits
- [ ] 4.2 Normalize posts to `PostRecord` (author id, account creation time when available, event time)
- [ ] 4.3 Add `seen_posts` table and insert-on-conflict dedup, surviving restart
- [ ] 4.4 Honor rate-limit headers and back off on throttling
- [ ] 4.5 Tests: duplicate poll, restart, throttled response, missing optional field

## 5. Market tick ingestion (Alpaca)

- [ ] 5.1 Load Alpaca credentials from environment; ensure they never appear in logs or records
- [ ] 5.2 Implement WebSocket trade stream subscription for the configured watchlist
- [ ] 5.3 Fail startup when watchlist exceeds the configured plan's symbol limit
- [ ] 5.4 Normalize trades to `TickRecord` and publish keyed by ticker
- [ ] 5.5 Implement reconnect with backoff and historical-trades gap fill without duplicates
- [ ] 5.6 Tests: ordering per ticker, over-limit watchlist, drop-and-reconnect gap fill

## 6. Recording and replay

- [ ] 6.1 Implement recorder consumer writing `recorded_events` (batched inserts, indexed by event time)
- [ ] 6.2 Implement replayer: read range ordered by event time, scale gaps by speed factor, publish with replay header
- [ ] 6.3 Add replay trigger (CLI or HTTP endpoint) with range and speed parameters
- [ ] 6.4 Verify replay does not delay live publishing
- [ ] 6.5 Tests: restart survival, 10x speed gap check, replay marker present

## 7. Week-1 checks and wrap-up

- [ ] 7.1 Confirm Alpaca free-tier limits and data storage/replay terms; record findings in README
- [ ] 7.2 Confirm Reddit API terms for the intended read-only use; record findings in README
- [ ] 7.3 Run an end-to-end demo: live ingest for a watchlist, record an hour, replay at 10x
