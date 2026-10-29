-- Small key/value state for the Finnhub connector (ticker rotation position), so a restart resumes where it stopped.
CREATE TABLE IF NOT EXISTS finnhub_state (
    name       TEXT        PRIMARY KEY,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
