-- Ledger: a flag is decided at most once per channel (channel = webhook-N, never the URL). This is the dedupe.
CREATE TABLE alert_flags (
    channel   text        NOT NULL,
    flag_id   bigint      NOT NULL REFERENCES api_flags (id) ON DELETE CASCADE,
    ticker    text        NOT NULL,
    raised_at timestamptz NOT NULL,
    outcome   text        NOT NULL CHECK (outcome IN ('queued', 'digested', 'suppressed')),
    PRIMARY KEY (channel, flag_id)
);
CREATE INDEX alert_flags_ticker ON alert_flags (channel, ticker, raised_at DESC);

-- Outbox: durable deliveries. payload is the message text (notice and model version included), never a URL.
CREATE TABLE alert_outbox (
    id              bigserial PRIMARY KEY,
    channel         text        NOT NULL,
    kind            text        NOT NULL CHECK (kind IN ('flag', 'digest')),
    payload         text        NOT NULL,
    status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts        int         NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL,
    created_at      timestamptz NOT NULL,
    sent_at         timestamptz,
    last_error      text
);
CREATE INDEX alert_outbox_due ON alert_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX alert_outbox_recent ON alert_outbox (channel, created_at);
