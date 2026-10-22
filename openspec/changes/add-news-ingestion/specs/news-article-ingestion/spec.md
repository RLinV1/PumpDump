# Spec Delta

## Purpose

Collects news articles and company press releases from several free sources and publishes them as normalized records, so later stages can check whether a verifiable news item exists for a ticker.

## ADDED Requirements

### Requirement: Normalized article records
The system SHALL publish every fetched article to the raw-news topic as a record with source, source item id, headline, summary or body when available, URL, linked tickers when the source provides them, publication time (event time), and fetch time.

#### Scenario: Alpaca article with symbols
- **WHEN** Alpaca News returns an article that lists symbols
- **THEN** the published record contains those symbols as linked tickers

#### Scenario: Press release without tickers
- **WHEN** a press-release feed item carries no ticker information
- **THEN** the record is published with an empty linked-ticker list

### Requirement: Per-source duplicate suppression
The system SHALL publish an article at most once per source and source item id, including after a restart.

#### Scenario: Same item polled twice
- **WHEN** two fetches of the same source return the same item id
- **THEN** only one record is published

### Requirement: Cross-source story fingerprint
The system SHALL attach a content fingerprint derived from the normalized headline to every article record, so the same story from different sources shares one fingerprint, and SHALL NOT drop any source's record.

#### Scenario: Same story from two sources
- **WHEN** Alpaca News and a press-release feed publish the same headline
- **THEN** both records are published and carry the same fingerprint

### Requirement: Watchlist coverage
The system SHALL fetch company news for every ticker in the configured watchlist and general market news, within each source's rate limit.

#### Scenario: Watchlist ticker news
- **WHEN** a news item is published about a watchlist ticker
- **THEN** it is fetched and published within the configured polling interval

#### Scenario: Rate limit approached
- **WHEN** the fetch schedule would exceed a source's per-minute limit
- **THEN** the connector spaces requests to stay under the limit instead of failing

### Requirement: Source isolation
The system SHALL keep each source's failures from stopping the other sources.

#### Scenario: One source down
- **WHEN** one source returns errors for several consecutive fetches
- **THEN** the other sources continue publishing and the failing source reports unhealthy
