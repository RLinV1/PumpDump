# Spec Delta

## Purpose

Decides whether a model is actually better than simple rules, using a split that cannot leak the future and metrics a user of the alerts would care about.

## ADDED Requirements

### Requirement: Time-based split
The system SHALL train on earlier episodes and test on later ones, and SHALL keep every window of one episode on the same side of the split.

#### Scenario: Split by time
- **WHEN** the evaluation runs
- **THEN** every training episode ends before any test episode begins, and no episode appears on both sides

### Requirement: Decision-relevant metrics
The system SHALL report precision-recall area, precision among the top flags per day, false flags per day on normal days, and the median lead time between the flag and the price peak, each with a bootstrap confidence interval.

#### Scenario: Report
- **WHEN** an evaluation completes
- **THEN** the report lists each metric with its interval and the number of episodes behind it

### Requirement: Baselines to beat
The system SHALL compare every model with the rule-based score and with a chatter-volume-only score, and SHALL state whether the model beats both.

#### Scenario: Model loses to rules
- **WHEN** a model does not beat the rule-based score on the held-out period
- **THEN** the report says so and the model is not promoted

### Requirement: Promotion gate
The system SHALL replace the live model only when the candidate beats the current one on a held-out period and passes the catalyst monotonicity test.

#### Scenario: Candidate passes
- **WHEN** a candidate beats the current model and passes the catalyst test
- **THEN** it is written as the next model version with its model card

### Requirement: Model card
The system SHALL write, with each model, a card stating the data used, its size, the metrics, known limits, the license of every component, and the date.

#### Scenario: Card present
- **WHEN** a model file is published
- **THEN** a model card with all listed fields is published beside it
