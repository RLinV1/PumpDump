# Spec Delta

## Purpose

Turns a ticker's features into a versioned risk score with an explanation, using a trained model when one is available and a transparent rule set when not.

## ADDED Requirements

### Requirement: Model family
The system SHALL use a supervised gradient-boosted decision-tree classifier as its main scoring model, trained on windowed tabular features, and SHALL NOT depend on a neural network or a hosted language model for the score.

#### Scenario: Scorer inputs
- **WHEN** the model scores a window
- **THEN** its inputs are the numeric social, market and catalyst features for that window and nothing else

### Requirement: Cold-start baseline without labels
The system SHALL score with an unsupervised anomaly baseline (z-scores of each feature against its own history, combined by fixed rules) until enough labeled episodes exist to train the classifier.

#### Scenario: No labeled data yet
- **WHEN** the dataset has fewer episodes than the minimum
- **THEN** the system scores with the anomaly baseline and marks every score as rules

### Requirement: Versioned score
The system SHALL emit, for each ticker and window, a score from 0 to 100 together with the scorer type (rules or model) and the model version used.

#### Scenario: Model scorer
- **WHEN** a model file is loaded and passes its self-check
- **THEN** every score names the model version and the scorer type is model

### Requirement: Rule-based fallback
The system SHALL fall back to a documented rule-based score when no model is available or the model fails its self-check, and SHALL mark every score produced that way.

#### Scenario: Missing model file
- **WHEN** the scorer starts and cannot load a valid model file
- **THEN** it scores with rules, marks each score as rules, and reports the reason in its health output

### Requirement: Catalyst can only lower the score
The system SHALL ensure that, with all other features equal, stronger catalyst evidence never raises a ticker's score.

#### Scenario: Add a filing
- **WHEN** the same features are scored once with no filing and once with a filing filed before the move
- **THEN** the score with the filing is less than or equal to the score without it

### Requirement: Explanation
The system SHALL report, with each score above the flag level, how much each feature group (social, market, catalyst) contributed, by re-scoring with that group reset to its baseline.

#### Scenario: Social-driven flag
- **WHEN** a flagged score drops sharply when social features are reset
- **THEN** the explanation lists social as the largest contributor and states the size of the drop

### Requirement: Calibrated levels
The system SHALL set the flag level from a calibration step on held-out data, so that the score maps to an observed rate of confirmed episodes, and SHALL record the calibration date and data with the model.

#### Scenario: New model version
- **WHEN** a new model is trained
- **THEN** its model card states the flag level and the held-out precision and false-alert rate at that level

### Requirement: Language-promotion feature
The system SHALL compute a promotional-language score for posts using a model whose license permits free use, and SHALL record that model's name and license in the model card.

#### Scenario: Model license
- **WHEN** a text model is added to the scorer
- **THEN** its license is recorded, and a model with a non-commercial license is rejected
