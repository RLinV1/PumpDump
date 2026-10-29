CREATE TABLE recorded_events (
    id          bigserial PRIMARY KEY,
    topic       text        NOT NULL,
    record_key  text        NOT NULL DEFAULT '',
    event_time  timestamptz NOT NULL,
    payload     text        NOT NULL,
    kafka_partition int     NOT NULL,
    kafka_offset    bigint  NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recorded_events_dedupe UNIQUE (topic, kafka_partition, kafka_offset)
);

CREATE INDEX recorded_events_time_idx ON recorded_events (event_time, id);
