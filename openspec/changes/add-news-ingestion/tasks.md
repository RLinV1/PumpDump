## 1. Common records and topics

- [x] 1.1 Add `ArticleRecord` and `FilingRecord` types to `common` with schema version, event time and ingest time
- [x] 1.2 Add `raw-news` and `raw-filings` topics to topic creation and constants
- [x] 1.3 Add record validation with unit tests (required fields, empty ticker list allowed)
- [x] 1.4 Add headline normalization and SHA-256 fingerprint with unit tests (case, punctuation, boilerplate)

## 2. Connector framework

- [x] 2.1 Define a `NewsSource` interface and per-source scheduling with independent health reporting
- [x] 2.2 Add shared token-bucket rate limiter configurable per source
- [ ] 2.3 Extend the `seen` table dedup to cover news item ids and accession numbers
- [x] 2.4 Test: one failing source does not stop the others

## 3. Alpaca News

- [x] 3.1 Implement REST fetch for backfill and gap fill using existing Alpaca credentials
- [x] 3.2 Implement WebSocket news stream with reconnect, reusing market connector logic
- [x] 3.3 Normalize to `ArticleRecord` with symbols as linked tickers
- [x] 3.4 Tests: article with symbols, duplicate item, reconnect gap fill

## 4. SEC EDGAR 8-K

- [x] 4.1 Poll the current-filings Atom feed filtered to 8-K and 8-K/A
- [x] 4.2 Load and daily-refresh the SEC company-ticker mapping
- [x] 4.3 Extract item codes from the filing index and normalize to `FilingRecord` using acceptance time as event time
- [x] 4.4 Send configured User-Agent and enforce request spacing below the SEC limit
- [x] 4.5 Tests: form filtering, known and unmapped filer, duplicate accession number, burst of filings

## 5. Finnhub

- [x] 5.1 Implement company-news polling per watchlist ticker with date window, and general market news
- [x] 5.2 Spread calls across the minute with the token bucket; rotate tickers across cycles
- [x] 5.3 Normalize to `ArticleRecord`
- [x] 5.4 Tests: rate limit never exceeded for a watchlist larger than one cycle allows

## 6. Press-release RSS

- [x] 6.1 Implement feed polling with ETag / Last-Modified for PR Newswire, GlobeNewswire and Business Wire from configuration
- [x] 6.2 Normalize items to `ArticleRecord`, linking tickers only when present in the item
- [x] 6.3 Tests: unchanged feed, new item, item without tickers

## 7. Recording, cross-source behavior and wrap-up

- [ ] 7.1 Add `raw-news` and `raw-filings` to the recorder and verify replay of both
- [ ] 7.2 Test: same story from two sources keeps both records with one fingerprint
- [ ] 7.3 Confirm each source's terms for storing items for replay and each rate limit; record findings in README
- [ ] 7.4 End-to-end demo: live news and filings for the watchlist, record, replay at 10x alongside posts and ticks
