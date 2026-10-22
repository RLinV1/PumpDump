# Spec Delta

## Purpose

Defines delivery guarantees and operability shared by all connectors, so no record is lost without trace and operators can tell when a connector is unhealthy.

## ADDED Requirements

### Requirement: Dead-letter handling
The system SHALL publish any record that fails validation to the dead-letter topic together with the failure reason and original payload, and SHALL continue processing later records.

#### Scenario: Malformed record
- **WHEN** a fetched item lacks a required field
- **THEN** it is published to the dead-letter topic with the reason and the original payload, and the next item is processed normally

### Requirement: No loss on broker unavailability
The system SHALL retain records it could not publish and SHALL deliver them once the broker is reachable again, up to a configured buffer limit.

#### Scenario: Broker restarts
- **WHEN** the broker is unreachable for 30 seconds while a connector fetches data
- **THEN** all records fetched in that time are published after the broker returns

#### Scenario: Buffer limit reached
- **WHEN** the buffer limit is reached during a longer outage
- **THEN** the connector stops fetching and reports unhealthy instead of dropping records silently

### Requirement: Connector health reporting
The system SHALL expose per-connector health, last successful fetch time, records published per second, and dead-letter count.

#### Scenario: Stalled connector
- **WHEN** a connector has fetched nothing for longer than its configured staleness threshold
- **THEN** its health status reports unhealthy

### Requirement: Local environment
The system SHALL start all required infrastructure for development with one command.

#### Scenario: Fresh checkout
- **WHEN** a developer runs the documented start command on a clean machine with the container runtime installed
- **THEN** the broker and database are running and the connectors can start against them
