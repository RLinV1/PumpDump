# Proposal

## Why

Pumpwatch exists to tell a coordinated pump from a real news-driven move or ordinary hype. That judgment has to come from a model, and today nothing scores anything. The hard parts are not the algorithm: they are building honest features from messy feeds, getting enough trustworthy labels, and proving the model beats simple rules instead of just sounding clever.

## What Changes

- Add feature extraction: link posts to tickers, then build windowed social, market and catalyst features per ticker.
- Add the scorer: a rule-based baseline first, then a gradient-boosted model exported to ONNX and served inside the JVM, with a per-flag explanation.
- Treat catalyst evidence as a first-class input, with a monotonic constraint so real news can only lower the score.
- Add a labeled dataset built from public enforcement actions and carefully chosen negatives, with a documented schema.
- Add an evaluation harness with a time-based split, honest metrics with confidence intervals, baselines to beat, and a promotion gate.
- Out of scope: the API, alert delivery, the web app and deployment.

## Capabilities

### New Capabilities
- `ticker-feature-extraction`: Link posts to tickers and build reproducible windowed social, market and catalyst features.
- `pump-risk-scoring`: Turn features into a versioned, explainable risk score, with a transparent fallback.
- `labeled-pump-dataset`: A sourced, versioned set of labeled episodes used to train and test the model.
- `model-evaluation`: Leak-free evaluation, baselines and a promotion gate for new model versions.

### Modified Capabilities
<!-- None. -->

## Impact

- Consumes the raw topics from `add-ingestion-pipeline` and `add-news-ingestion`, and the shared records from `define-system-architecture`.
- New code: Java feature-builder and scorer modules, a Python training and evaluation project, label files under `data/labels/`, and model files with model cards.
- New dependencies, all permissively licensed: ONNX Runtime, LightGBM, scikit-learn, a small sentence-embedding model for offline analysis. Models with non-commercial licenses are excluded (see `add-compliance-guardrails`).
- Assumption to confirm: enough episodes can be found in public enforcement data to train and test at all. If not, the system ships with the rule scorer and reports that plainly.
