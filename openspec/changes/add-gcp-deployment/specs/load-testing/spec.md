# Spec Delta

## Purpose

Gives repeatable numbers for how the read API and the live stream behave under load, so results can be compared across runs and quoted.

## ADDED Requirements

### Requirement: Read API load test
The system SHALL provide a load test that ramps virtual users against the read endpoints and reports requests per second, p50, p95 and p99 latency and error rate.

#### Scenario: Thresholds
- **WHEN** the test finishes
- **THEN** it fails if p95 latency is above 500 ms or the error rate is above 1 percent

### Requirement: Live stream load test
The system SHALL provide a load test that holds many concurrent stream connections open and reports how many connected and how many stayed up for the full duration.

#### Scenario: Concurrent clients
- **WHEN** the test opens its configured number of stream connections
- **THEN** it reports how many clients received data, how many dropped and how many were refused

### Requirement: Rate limit awareness
The system SHALL let the load test run against a target with the per-client rate limit raised, and SHALL record the limit used in the results.

#### Scenario: Rate limited run
- **WHEN** the target enforces its default limit
- **THEN** rate-limited responses are counted separately from errors

### Requirement: Summary output
The system SHALL write a short results summary in a stable format after each run.

#### Scenario: Summary file
- **WHEN** a run completes
- **THEN** a summary with target, date, virtual users, requests per second, latency percentiles, error rate and stream results is written to disk
