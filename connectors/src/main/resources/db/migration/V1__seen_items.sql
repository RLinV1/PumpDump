-- Items each connector has already published, so a restart or a re-poll never publishes twice.
CREATE TABLE IF NOT EXISTS seen_items (
    source     TEXT        NOT NULL,
    item_id    TEXT        NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, item_id)
);
