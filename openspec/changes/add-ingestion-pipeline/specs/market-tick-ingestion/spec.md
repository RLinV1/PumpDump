# Spec Delta

## Purpose

Collects live trades from Alpaca for a configurable watchlist and publishes them as normalized, ticker-keyed records for joining with social activity.

## ADDED Requirements

### Requirement: Normalized tick records
The system SHALL publish each trade received from Alpaca to the ticks topic as a record with ticker, price, size, exchange timestamp (event time), and receive time.

#### Scenario: Trade published
- **WHEN** Alpaca delivers a trade for a watchlist ticker
- **THEN** a normalized tick record is published to the ticks topic keyed by that ticker

### Requirement: Per-ticker ordering
The system SHALL preserve the order of ticks for the same ticker.

#### Scenario: Consecutive trades
- **WHEN** two trades for the same ticker arrive in order
- **THEN** consumers of the ticks topic read them in that order

### Requirement: Configurable watchlist
The system SHALL read the watchlist from configuration and SHALL refuse to start if it exceeds the symbol limit of the configured Alpaca plan.

#### Scenario: Watchlist within limit
- **WHEN** the watchlist has no more symbols than the plan allows
- **THEN** the connector subscribes to all of them

#### Scenario: Watchlist over limit
- **WHEN** the watchlist has more symbols than the plan allows
- **THEN** the connector fails at startup with an error naming the limit

### Requirement: Stream reconnection and gap fill
The system SHALL reconnect after a dropped stream and SHALL backfill the missed interval from Alpaca historical data, so ticks are not silently missing.

#### Scenario: Stream drops for two minutes
- **WHEN** the connection is lost and later restored
- **THEN** the connector reconnects and publishes the trades from the missed interval before or alongside live ticks, without duplicates

### Requirement: Credentials never logged
The system SHALL load Alpaca credentials from the environment and SHALL NOT write them to logs or published records.

#### Scenario: Startup logging
- **WHEN** the connector starts with credentials set
- **THEN** no log line or record contains the key or secret values
