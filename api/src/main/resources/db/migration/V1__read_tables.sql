-- run_id is 'live' for live topics, otherwise the replay run id (from the topic name or pw-run-id header).
CREATE TABLE api_scores (
    id              bigserial PRIMARY KEY,
    run_id          text             NOT NULL,
    topic           text             NOT NULL,
    kafka_partition int              NOT NULL,
    kafka_offset    bigint           NOT NULL,
    ticker          text             NOT NULL,
    window_end      timestamptz      NOT NULL,
    score           double precision NOT NULL,
    model_version   text             NOT NULL,
    stale_sources   text             NOT NULL DEFAULT '',
    ingest_time     timestamptz      NOT NULL,
    CONSTRAINT api_scores_dedupe UNIQUE (topic, kafka_partition, kafka_offset)
);
CREATE INDEX api_scores_lookup ON api_scores (run_id, ticker, window_end DESC);

-- id doubles as the SSE event id.
CREATE TABLE api_flags (
    id              bigserial PRIMARY KEY,
    run_id          text        NOT NULL,
    topic           text        NOT NULL,
    kafka_partition int         NOT NULL,
    kafka_offset    bigint      NOT NULL,
    ticker          text        NOT NULL,
    raised_at       timestamptz NOT NULL,
    evidence        jsonb       NOT NULL,
    CONSTRAINT api_flags_dedupe UNIQUE (topic, kafka_partition, kafka_offset)
);
CREATE INDEX api_flags_recent ON api_flags (run_id, raised_at DESC, id DESC);
CREATE INDEX api_flags_stream ON api_flags (run_id, id);
