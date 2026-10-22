# Spec Delta

## Purpose

Estimates how far a ticker may move over the next hour, so a user can tell a calm stock from a violent one.

## ADDED Requirements

### Requirement: Next-hour swing forecast
The system SHALL publish, for each scored ticker, a median and an upper-band forecast of the next 60-minute price range, refreshed on the same cadence as the pump score.

#### Scenario: Forecast available
- **WHEN** a ticker has enough history and a score window completes
- **THEN** the score record carries the median swing, the upper band and a model version

#### Scenario: Not enough history
- **WHEN** a ticker lacks the minimum history
- **THEN** the system publishes no forecast and marks the reason as insufficient history

### Requirement: Regime relative to the ticker
The system SHALL label each forecast calm, elevated or extreme by comparing the median swing with that ticker's own trailing distribution of hourly ranges.

#### Scenario: Same figure, different regimes
- **WHEN** two tickers have the same forecast swing but different histories
- **THEN** each is labeled by its own history, so the labels can differ

### Requirement: Baseline first, promotion by evidence
The system SHALL serve a transparent baseline forecast until a trained model beats it on a time-based split in both a calm and a stressed period.

#### Scenario: Model fails the gate
- **WHEN** a trained model does not beat the baseline on both periods
- **THEN** the baseline remains in service and the evaluation report says so

### Requirement: Honest uncertainty
The system SHALL check that the upper band contains the realized range at about its stated rate on held-out data, and SHALL widen the displayed band when it does not.

#### Scenario: Coverage check
- **WHEN** an evaluation completes
- **THEN** the report lists observed coverage for the upper band with a confidence interval

### Requirement: Size of move, never direction
The system SHALL present the forecast as the size of a possible move and SHALL NOT present it as a prediction of direction or as advice to buy or sell.

#### Scenario: Display
- **WHEN** the forecast is shown in any surface
- **THEN** it is accompanied by the not-investment-advice notice and carries no direction cue
