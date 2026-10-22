# Spec Delta

## Purpose

Turns raw posts, trades, news and filings into reproducible per-ticker features over fixed time windows, so training and live scoring see exactly the same numbers.

## ADDED Requirements

### Requirement: Ticker linking
The system SHALL link a post to a ticker only when it uses a cashtag for a known symbol, or when the symbol appears with context confirming it is a ticker, and SHALL ignore symbols that are also common words otherwise.

#### Scenario: Cashtag
- **WHEN** a post contains a cashtag for a symbol on the known-symbol list
- **THEN** the post is linked to that ticker

#### Scenario: Common word
- **WHEN** a post contains an upper-case word that is also a listed symbol and has no cashtag or confirming context
- **THEN** the post is not linked to any ticker

### Requirement: Social features
The system SHALL compute, for each ticker and window, the mention count, the mention count against a trailing seven-day baseline, the number of distinct authors, the share of posts from accounts younger than 30 days, and the share of posts that are near-duplicates of another post in the window.

#### Scenario: Copy-paste campaign
- **WHEN** many new accounts post near-identical text about one ticker within a window
- **THEN** the near-duplicate share and the new-account share for that window are both high

### Requirement: Market features
The system SHALL compute, for each ticker and window, the price return, the volume against a trailing baseline, the realised volatility, and the traded dollar volume.

#### Scenario: Volume jump
- **WHEN** a ticker trades far more volume than its baseline in a window
- **THEN** its volume ratio for that window reflects the jump

### Requirement: Catalyst features
The system SHALL compute, for each ticker and window, the number of 8-K filings and their item codes in the previous 24 hours, the number of distinct news outlets in the previous six hours, the minutes since the latest catalyst, and whether a catalyst preceded the start of the move.

#### Scenario: Filing before the move
- **WHEN** an 8-K for a ticker was filed 40 minutes before its volume jumped
- **THEN** the catalyst features show one filing, its item codes, 40 minutes since catalyst, and a catalyst preceding the move

### Requirement: Reproducible features
The system SHALL produce identical features for a ticker and window whether the inputs arrive live or are replayed from the recorder.

#### Scenario: Replay equals live
- **WHEN** a recorded hour is replayed
- **THEN** every feature for every ticker and window equals the value computed live for that hour

### Requirement: No look-ahead
The system SHALL use only records with an event time at or before the end of a window when computing that window's features.

#### Scenario: Future record
- **WHEN** a record has an event time after a window ends
- **THEN** it does not affect that window's features
