-- Synthetic read data for load tests only: 50 tickers, 6 hours of 1-minute scores, 200 flags.
-- Usage: docker compose exec -T postgres psql -U pumpwatch -d pumpwatch < load/seed.sql
-- Clears only rows written by a previous seed (topic 'load-seed').
DELETE FROM api_flags WHERE topic = 'load-seed';
DELETE FROM api_scores WHERE topic = 'load-seed';

WITH tickers AS (
  SELECT t, CASE WHEN n = 1 THEN 'GME' ELSE 'L' || chr(64 + (n / 26) + 1) || chr(65 + (n % 26)) END AS ticker
  FROM generate_series(1, 50) AS n, LATERAL (SELECT n AS t) x
)
INSERT INTO api_scores (run_id, topic, kafka_partition, kafka_offset, ticker, window_end, score, model_version, ingest_time)
SELECT 'live', 'load-seed', 0, row_number() OVER (), ticker,
       now() - make_interval(mins => m), 20 + random() * 70, 'load-seed', now()
FROM tickers, generate_series(0, 359) AS m;

INSERT INTO api_flags (run_id, topic, kafka_partition, kafka_offset, ticker, raised_at, evidence)
SELECT 'live', 'load-seed', 0, i, 'GME', now() - make_interval(mins => i),
       '{"score":74,"modelVersion":"load-seed","topContributors":[{"featureGroup":"social","delta":30.0},{"featureGroup":"market","delta":24.0}],"postCount":80,"tradeCount":200,"catalyst":{"found":false,"items":[]}}'::jsonb
FROM generate_series(1, 200) AS i;
