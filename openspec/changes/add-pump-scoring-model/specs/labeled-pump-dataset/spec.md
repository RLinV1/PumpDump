# Spec Delta

## Purpose

Defines the sourced, versioned set of labeled episodes the model is trained and tested on, so every label can be traced to evidence and the limits of the data are stated.

## ADDED Requirements

### Requirement: Label schema
The system SHALL store each labeled episode with the ticker, start and end time, a class (pump, hype, news_move or normal), a source URL, a confidence level and the date it was labeled.

#### Scenario: Add an episode
- **WHEN** an episode is added without a source URL
- **THEN** the dataset validation rejects it

### Requirement: Positive episodes from public sources
The system SHALL draw pump episodes from public enforcement records and well-documented cases, and SHALL record the source of each.

#### Scenario: Enforcement action
- **WHEN** a public enforcement record names a ticker and a date range of manipulation
- **THEN** it can be added as a pump episode with that record as its source

### Requirement: Negatives that matter
The system SHALL include as negatives news-backed large moves, hype without manipulation, and matched random controls with similar market cap and volume.

#### Scenario: News-backed mover
- **WHEN** a ticker moves sharply on the day an 8-K reports a material event
- **THEN** it can be added as a news_move episode, which the model must learn to score low

### Requirement: Versioned and immutable
The system SHALL version the dataset, and SHALL NOT change an episode's label without a new version and a recorded reason.

#### Scenario: Relabel
- **WHEN** an episode's class is changed
- **THEN** a new dataset version is created and the change and reason are recorded

### Requirement: Honest size reporting
The system SHALL report the number of episodes per class and per period, and SHALL refuse to train when any class has fewer than a configured minimum.

#### Scenario: Too few pumps
- **WHEN** the dataset has fewer pump episodes than the minimum
- **THEN** training stops with a message naming the shortfall
