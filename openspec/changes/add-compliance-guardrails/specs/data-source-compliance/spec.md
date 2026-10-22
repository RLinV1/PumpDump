# Spec Delta

## Purpose

Keeps the system free to run and inside each source's terms, by recording the terms, defaulting to free tiers, limiting what is stored and shown, and blocking incompatible licenses before they ship.

## ADDED Requirements

### Requirement: Source register
The system SHALL keep a register listing every external data source with its plan, rate limit, terms link and the date the terms were last verified, and SHALL fail the build when a configured source has no register entry.

#### Scenario: New connector without an entry
- **WHEN** a connector for a new source is added without a register entry
- **THEN** the build fails and names the missing source

### Requirement: Free tier by default
The system SHALL run every source on its free plan by default, SHALL keep paid feeds disabled unless explicitly enabled in configuration, and SHALL log the active plan of each source at startup.

#### Scenario: Default startup
- **WHEN** the system starts with default configuration
- **THEN** no paid feed is active and each source's plan is logged

### Requirement: Watchlist within plan limits
The system SHALL refuse to start a stream whose watchlist exceeds the source plan's symbol limit, and SHALL name the limit in the error.

#### Scenario: Watchlist too large
- **WHEN** the configured watchlist has more symbols than the plan allows
- **THEN** the stream does not start and the error names the plan limit

### Requirement: Rate limits below published limits
The system SHALL keep each source's request rate below its published limit with a shared limiter, and SHALL identify itself with a descriptive client name where the source requires it.

#### Scenario: Burst of requests
- **WHEN** more requests are queued than the limit allows in a minute
- **THEN** they are spaced to stay under the limit

### Requirement: Social source permissions
The system SHALL record for each social source whether its terms allow scoring, storing derived data and training models, SHALL keep sources that forbid training out of every training set, and SHALL keep paid or unconfirmed social sources disabled by default.

#### Scenario: Source forbids training
- **WHEN** a social source is registered as not permitting model training
- **THEN** its records feed live scoring only and are excluded from the training export

### Requirement: Derived social data only
The system SHALL store, for social content, only the post identifier, the author-age bucket, a text fingerprint, linked tickers and timestamps, SHALL NOT store raw text beyond a configured retention of zero or more days, and SHALL purge a record when the source reports its deletion.

#### Scenario: Source deletes a post
- **WHEN** a source reports that a post was deleted
- **THEN** the stored record and any raw text for it are removed

### Requirement: No raw content in public output
The system SHALL NOT show raw post text, author names or full third-party articles in the public web page, the API or alerts, and SHALL show only counts, scores and short evidence summaries.

#### Scenario: Evidence display
- **WHEN** a flag's evidence is shown publicly
- **THEN** it contains counts and feature contributions and no post text or author names

### Requirement: License gate
The system SHALL check the licenses of code dependencies and of every model before release, and SHALL fail when one is non-commercial, share-alike on shipped artifacts, or unknown.

#### Scenario: Non-commercial model
- **WHEN** a model with a non-commercial license is added to the scorer
- **THEN** the license gate fails and names the model and its license

### Requirement: Not-advice and non-commercial notices
The system SHALL include a not-investment-advice notice in every score, flag and alert, and SHALL state the project's non-commercial status on its public pages.

#### Scenario: Public page
- **WHEN** the landing page is viewed
- **THEN** it states that the output is a risk signal and not advice, and that the project is non-commercial
