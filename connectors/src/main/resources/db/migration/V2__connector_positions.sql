-- Where each connector's stream stopped, so a restart resumes instead of going live.
CREATE TABLE IF NOT EXISTS connector_positions (
    source     TEXT        PRIMARY KEY,
    position   TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
