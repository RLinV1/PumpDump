-- SEC company_tickers.json, refreshed daily. cik has no leading zeros.
CREATE TABLE IF NOT EXISTS sec_company_tickers (
    cik        TEXT        PRIMARY KEY,
    ticker     TEXT        NOT NULL,
    title      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
