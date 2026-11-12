# Spec Delta

## Purpose

Keeps the flag assistant on Gemini when one model is retired or out of quota.

## ADDED Requirements

### Requirement: Gemini model rotation
The assistant SHALL try Gemini models in order, starting with `GEMINI_MODEL` when set, and move to the next model only on a 404, a 429 or a server error.

#### Scenario: First model is retired
- **WHEN** the first model returns 404
- **THEN** the next model answers and one line names the failed model

#### Scenario: Other error
- **WHEN** a model returns any other error
- **THEN** the error is raised at once and the mock fallback answers

#### Scenario: Every model fails
- **WHEN** all models fail with rotating errors
- **THEN** the last error is raised and the mock fallback answers
