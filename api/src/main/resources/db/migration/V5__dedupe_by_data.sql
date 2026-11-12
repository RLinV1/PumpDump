-- Dedupe by the data, not by Kafka (topic, partition, offset): offsets restart at 0 if Kafka is wiped and Postgres kept.
-- Existing duplicates go first, keeping the lowest id (alert_flags rows cascade).
DELETE FROM api_scores a USING api_scores b
WHERE a.id > b.id AND a.run_id = b.run_id AND a.ticker = b.ticker
  AND a.window_end = b.window_end AND a.model_version = b.model_version;
DELETE FROM api_flags a USING api_flags b
WHERE a.id > b.id AND a.run_id = b.run_id AND a.ticker = b.ticker AND a.raised_at = b.raised_at;

ALTER TABLE api_scores DROP CONSTRAINT api_scores_dedupe;
ALTER TABLE api_scores ADD CONSTRAINT api_scores_dedupe UNIQUE (run_id, ticker, window_end, model_version);
ALTER TABLE api_flags DROP CONSTRAINT api_flags_dedupe;
ALTER TABLE api_flags ADD CONSTRAINT api_flags_dedupe UNIQUE (run_id, ticker, raised_at);
