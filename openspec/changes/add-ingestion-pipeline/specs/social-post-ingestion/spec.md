# Spec Delta

## Purpose

Collects posts about stocks from social sources and publishes them as normalized records, so downstream stages see one consistent post format regardless of source.

## ADDED Requirements

### Requirement: Normalized post records
The system SHALL publish every fetched post to the raw-posts topic as a record with source, source post id, author id, author account creation time when available, text, post creation time (event time), and fetch time.

#### Scenario: Reddit post published
- **WHEN** a configured subreddit returns a new post
- **THEN** a record containing all normalized fields is published to the raw-posts topic

#### Scenario: Missing optional field
- **WHEN** a source does not provide the author account creation time
- **THEN** the record is still published with that field empty

### Requirement: Duplicate suppression
The system SHALL publish a post at most once per source and source post id, including after a connector restart.

#### Scenario: Same post fetched twice
- **WHEN** two polls return the same post id from the same source
- **THEN** only one record is published

#### Scenario: Restart after publishing
- **WHEN** the connector restarts and the source returns posts already published
- **THEN** no duplicate records are published for them

### Requirement: Rate-limit compliance
The system SHALL stay within the source's documented rate limits and SHALL back off when the source signals throttling.

#### Scenario: Throttled response
- **WHEN** the source responds that the request rate is exceeded
- **THEN** the connector waits for the indicated period before the next request and publishes no partial or corrupt records

### Requirement: Configurable sources
The system SHALL read the list of subreddits to follow and the poll interval from configuration without code changes.

#### Scenario: Add a subreddit
- **WHEN** an operator adds a subreddit to the configuration and restarts the connector
- **THEN** new posts from that subreddit are published
