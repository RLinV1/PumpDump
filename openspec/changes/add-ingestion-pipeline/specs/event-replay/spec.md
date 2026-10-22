# Spec Delta

## Purpose

Records raw ingested events and replays them into the live topics, so backtests and demos exercise the same downstream code as live traffic.

## ADDED Requirements

### Requirement: Recording
The system SHALL persist every record published to the raw-posts and ticks topics, with its event time, to durable storage that survives restarts.

#### Scenario: Record survives restart
- **WHEN** a record is published and the recorder restarts
- **THEN** the record is still available for replay

### Requirement: Replay into live topics
The system SHALL re-publish recorded records for a requested time range to the same topics and record format as live ingestion.

#### Scenario: Replay a past hour
- **WHEN** an operator requests replay of a recorded one-hour range
- **THEN** all recorded posts and ticks in that range are published to their topics in original event-time order

### Requirement: Replay speed control
The system SHALL replay at original speed or at a configured speedup factor while preserving the relative event-time gaps between records.

#### Scenario: Ten times speed
- **WHEN** replay runs at a speedup factor of 10
- **THEN** records that were 10 seconds apart are published about 1 second apart

### Requirement: Replay marking
The system SHALL mark replayed records so consumers can tell them apart from live records.

#### Scenario: Consumer reads replayed record
- **WHEN** a consumer reads a record published by replay
- **THEN** the record carries a replay marker and the id of the replay run

### Requirement: Live and replay isolation
The system SHALL NOT let a replay run block, reorder or delay live ingestion.

#### Scenario: Replay during live ingestion
- **WHEN** a replay runs while live connectors are publishing
- **THEN** live records continue to be published without added delay beyond normal variation
