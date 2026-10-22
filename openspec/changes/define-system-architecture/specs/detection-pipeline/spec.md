# Spec Delta

## Purpose

Defines what the whole system must do from a raw social post, trade, news item or filing to a flagged ticker, so every stage agrees on timing, replay behavior and what a flag contains.

## ADDED Requirements

### Requirement: Event-time processing
The system SHALL order, window and join all records by their event time, not by arrival time, and SHALL accept late records within a configured lateness bound.

#### Scenario: Late news item
- **WHEN** a news item published 90 seconds ago arrives after a later trade, and the lateness bound is two minutes
- **THEN** it is included in the window that covers its publication time

#### Scenario: Record beyond the bound
- **WHEN** a record arrives later than the lateness bound
- **THEN** it is counted in a late-data metric and does not change already-emitted scores

### Requirement: Replay parity
The system SHALL produce the same scores and flags when a recorded day is replayed as it produced live, given the same model version and configuration.

#### Scenario: Replay of a recorded day
- **WHEN** a recorded day is replayed at any speed with the model version used that day
- **THEN** the emitted flags match the live flags for the same tickers and event times

### Requirement: Flag latency
The system SHALL emit a flag within 60 seconds, at the 95th percentile, of the record that first pushes a ticker's score over the flag level.

#### Scenario: Record tips the score
- **WHEN** a record raises a ticker's score above the flag level
- **THEN** the flag appears on the flags topic within 60 seconds in at least 95 percent of cases

### Requirement: Explainable flags
The system SHALL attach evidence to every flag: the score, the model version, the main contributing features, the count of posts and trades behind it, and whether any filing or news item was found in the lookback window.

#### Scenario: Flag with no catalyst
- **WHEN** a flag is emitted for a ticker with no filing or news in the lookback window
- **THEN** the evidence states that no catalyst was found and lists the window that was checked

### Requirement: Flag de-duplication
The system SHALL NOT emit a second flag for the same ticker within a configured cooldown unless its score rises by a configured margin.

#### Scenario: Score stays high
- **WHEN** a flagged ticker stays above the flag level for ten minutes with a cooldown of thirty minutes
- **THEN** only the first flag is emitted

### Requirement: Failure isolation
The system SHALL keep scoring when one source is unavailable, and SHALL mark every score whose inputs include a stale source.

#### Scenario: Social feed down
- **WHEN** the social connector reports unhealthy for five minutes
- **THEN** scoring continues from trades, news and filings, and each score carries a stale-source marker for social features
