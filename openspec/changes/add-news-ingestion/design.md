# Design

## Context

Builds on `add-ingestion-pipeline`: shared record types in `common`, idempotent producer, bounded buffer, dead-letter topic, `seen` table for dedup, recorder and replayer, Actuator and Micrometer health. See proposal.md for motivation. The later scorer will join news and filings to ticker activity by ticker and event time, so ticker linkage and accurate event time matter more than body text.

## Goals / Non-Goals

**Goals:**
- Four sources behind one connector interface, publishing to two topics.
- Event time always equals the source's publication or acceptance time, never fetch time.
- Cross-source story linking that keeps every source's record.

**Non-Goals:**
- Judging whether news is real or promotional, sentiment, or free-text ticker extraction.
- Full filing text parsing beyond the 8-K item codes.

## Decisions

**Topics.** `raw-news` keyed by ticker when exactly one is known, else by fingerprint; `raw-filings` keyed by ticker when mapped, else by CIK. Keying by ticker keeps per-ticker order for the later join. Alternative: one combined topic; rejected because filings have a different schema and much lower volume.

**Alpaca News.** Use the REST news endpoint for backfill and gap fill, and its WebSocket news stream for live items, reusing the Alpaca credentials and reconnect code from the market connector. Alternative: poll only; rejected because the stream gives lower latency at no extra cost.

**EDGAR.** Poll the "current filings" Atom feed filtered to 8-K, and use the submissions endpoint only when an entry needs more detail. Load the company-ticker mapping at startup and refresh it daily. Item codes come from the filing index. Requests carry the configured User-Agent and pass through a shared rate limiter set below the SEC limit.

**Finnhub.** Poll company news per watchlist ticker with a date window, plus general market news. A shared token-bucket limiter spreads calls across the minute. Alternative: fetch the whole watchlist each cycle; rejected because it breaks the per-minute cap for larger watchlists.

**Press-release RSS.** One feed URL per wire service in configuration, polled on an interval with conditional requests (ETag / Last-Modified) to be polite. Tickers are taken from the feed item only when present; otherwise left empty.

**Fingerprint.** SHA-256 of the lowercased headline with punctuation and wire-service boilerplate stripped. Exact-match only for now. Alternative: fuzzy or embedding similarity; deferred to the ML change, since the raw records are preserved.

**Dedup storage.** Reuse the Postgres `seen` table with a `source` + `item id` key (accession number for filings).

**Connector structure.** A small `NewsSource` interface (poll or stream, normalize) with one implementation per source, each scheduled and health-reported independently so one source's failure does not stop the others.

**Recording.** Add the two new topics to the recorder configuration so news and filings replay with posts and ticks.

## Risks / Trade-offs

- [Free-tier limits throttle Finnhub for larger watchlists] → Token-bucket limiter, rotate tickers across cycles, keep the watchlist small.
- [RSS feed URLs or terms change] → URLs in configuration, per-source health, recorded data for demos.
- [Headline fingerprint misses reworded duplicates] → Accept false negatives now; fuzzy matching is a later change.
- [8-K ticker mapping misses recent listings, dual-class shares and delisted names] → Publish with empty ticker rather than dropping; log unmapped count.
- [Items arrive late, so event time is far behind ingest time] → Keep both times on every record; the scorer must window by event time.
