# Spec Delta

## Purpose

Gives the web app and operators read-only access to the latest scores, a ticker's timeline for charts, recent flags, and a live stream of new flags.

## ADDED Requirements

### Requirement: Watchlist scores
The system SHALL return, for every watchlist ticker, its latest score, scorer type, model version, the time of the score and any stale-source marker.

#### Scenario: Request the watchlist
- **WHEN** a client requests the watchlist
- **THEN** each ticker is returned with its latest score and the time the score was computed

### Requirement: Ticker timeline
The system SHALL return, for a ticker and a time range, aligned series of chatter, price, news and filing markers and score, using event time.

#### Scenario: Chart a flagged ticker
- **WHEN** a client requests the timeline of a flagged ticker for the last six hours
- **THEN** the response contains the chatter, price, catalyst markers and score on one time axis

### Requirement: Recent flags
The system SHALL return recent flags newest first, each with its evidence, and SHALL limit the page size.

#### Scenario: Request flags
- **WHEN** a client requests the latest flags with a limit of 20
- **THEN** at most 20 flags are returned, newest first, each with its evidence

### Requirement: Live flag stream
The system SHALL stream new flags to connected clients as they are emitted, and SHALL keep the connection alive with periodic heartbeats.

#### Scenario: New flag
- **WHEN** a flag is emitted while a client is connected
- **THEN** the client receives it on the stream within five seconds

### Requirement: Safe public access
The system SHALL be read-only, SHALL rate-limit clients, SHALL allow only configured origins, and SHALL NOT return raw post text or author identifiers.

#### Scenario: Too many requests
- **WHEN** a client exceeds the rate limit
- **THEN** it receives a clear rate-limit response with a retry time

### Requirement: Replay isolation
The system SHALL serve live data by default and SHALL serve a replay run only when its run id is requested.

#### Scenario: Replay data
- **WHEN** a replay is running and a client requests live flags
- **THEN** no replayed flag appears in the response

### Requirement: Disclaimer on every response
The system SHALL include a fixed notice in every flag and score response that the output is a risk signal and not investment advice.

#### Scenario: Any flag response
- **WHEN** a flag is returned
- **THEN** the response includes the notice
