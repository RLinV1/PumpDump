# Proposal

## Why

Pumpwatch must tell a pump from a real price move. The strongest signal is whether a verifiable catalyst exists for a ticker: a filed 8-K, a company press release, or credible news coverage. Without a news and filings stream, the later scorer cannot distinguish chatter-driven moves from news-driven ones. This change adds that stream on top of `add-ingestion-pipeline`.

## What Changes

- Add connectors for four sources: Alpaca News, SEC EDGAR 8-K filings, Finnhub company and market news, and company press-release RSS feeds (PR Newswire, GlobeNewswire, Business Wire).
- Add two new topics: `raw-news` for articles and press releases, and `raw-filings` for 8-K filings.
- Normalize all items to common record types with source, headline, body or summary when available, linked tickers when known, URL, and event time (publication or SEC acceptance time).
- Suppress duplicates within a source and link the same story seen on several sources through a shared content fingerprint, without discarding any source's record.
- Map SEC filers to tickers using the SEC company-ticker mapping, and keep 8-K item codes on each filing.
- Reuse the recorder, replayer, dead-letter handling and health reporting from `add-ingestion-pipeline` for the new topics.
- Out of scope: deciding whether news is real or promotional, sentiment, ticker extraction from free text, and paid news sources.

## Capabilities

### New Capabilities
- `news-article-ingestion`: Fetch articles and press releases from Alpaca News, Finnhub and press-release RSS feeds, publish normalized records to `raw-news`, and tag cross-source duplicates.
- `regulatory-filing-ingestion`: Fetch newly filed 8-K filings from SEC EDGAR, map filers to tickers, and publish normalized records to `raw-filings`.

### Modified Capabilities
<!-- None as spec files: the recorder, replayer and reliability behavior from add-ingestion-pipeline are reused through configuration. That change is not archived yet, so its capabilities are not in openspec/specs/. -->

## Impact

- Depends on `add-ingestion-pipeline` (common records, producer setup, dedup table, recorder, health metrics).
- New code: news and filing connectors in `connectors`, new record types in `common`, recorder topic configuration.
- External systems: Alpaca News (same account as market data), SEC EDGAR (public, requires a descriptive `User-Agent`, request-rate limit), Finnhub free tier (API key, per-minute limit), RSS feeds from three wire services.
- Assumptions to confirm in week 1: each source's terms allow storing items for replay; Finnhub free-tier limits cover the watchlist; RSS feed URLs and terms are current.
