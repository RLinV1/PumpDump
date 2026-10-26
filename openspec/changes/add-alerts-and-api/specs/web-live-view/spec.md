# Spec Delta

## Purpose

Lets the landing page show real flags and a real ticker timeline when the API is up, and keeps the clearly labelled simulation when it is not, so the page never misleads a visitor about what is real.

## ADDED Requirements

### Requirement: Real data when available
The web app SHALL show the latest real flags and a real ticker timeline when the API is reachable and returns live data.

#### Scenario: API up with a flag
- **WHEN** the API returns a recent flag
- **THEN** the page shows that flag and its evidence labelled as live

### Requirement: Labelled simulation otherwise
The web app SHALL show the existing simulation, labelled as simulated, when the API is unreachable or has no live data, and SHALL NOT mix real and simulated values in one view.

#### Scenario: API down
- **WHEN** the API request fails
- **THEN** the page shows the simulation with its simulated label and no error screen

### Requirement: Fast first paint
The web app SHALL render its content without waiting for the API, and SHALL load live data after first paint.

#### Scenario: Slow API
- **WHEN** the API takes ten seconds to respond
- **THEN** the page is fully visible and interactive meanwhile

### Requirement: No raw content
The web app SHALL show only aggregates, scores and evidence summaries, and SHALL NOT display raw post text or author names.

#### Scenario: Evidence display
- **WHEN** a flag's evidence is shown
- **THEN** it shows counts and feature contributions, not posts
