-- Records accepted from a connector but not yet acknowledged by Kafka.
CREATE TABLE IF NOT EXISTS outbox (
    id         BIGSERIAL   PRIMARY KEY,
    connector  TEXT        NOT NULL,
    topic      TEXT        NOT NULL,
    record_key TEXT,
    payload    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_connector_idx ON outbox (connector, id);
