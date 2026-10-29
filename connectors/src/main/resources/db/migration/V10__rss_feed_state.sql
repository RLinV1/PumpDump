-- Last ETag / Last-Modified seen per RSS feed, so conditional requests survive a restart.
CREATE TABLE IF NOT EXISTS rss_feed_state (
    feed_url      TEXT        PRIMARY KEY,
    etag          TEXT,
    last_modified TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
