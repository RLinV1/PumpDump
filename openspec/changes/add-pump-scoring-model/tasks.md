## 1. Ticker linking and social features

- [x] 1.1 Build the known-symbol list and the common-word exclusion list, with a loader and tests
- [x] 1.2 Implement cashtag and confirmed-context linking, with tests for common-word symbols
- [x] 1.3 Implement SimHash near-duplicate detection inside a window
- [x] 1.4 Compute windowed social features (mentions, baseline ratio, distinct authors, new-account share, duplicate share)

## 2. Market and catalyst features

- [x] 2.1 Compute windowed market features (return, volume ratio, realised volatility, dollar volume)
- [x] 2.2 Compute catalyst features from filings and news (counts, item codes, minutes since, preceded the move)
- [x] 2.3 Add look-ahead tests: a future record never changes a past window
- [x] 2.4 Add the live-equals-replay feature test over one recorded hour

## 3. Rule scorer and plumbing

- [x] 3.0 Implement the anomaly baseline (per-feature z-scores against history, combined by fixed rules) for use before labels exist
- [x] 3.1 Define the rule score in a documented table of thresholds and weights
- [x] 3.2 Implement `RuleScorer` and the scorer health output
- [x] 3.3 Implement the occlusion explainer for the three feature groups

## 4. Labeled dataset

- [ ] 4.1 Define the label schema, the validator and the version file under `data/labels/`
- [ ] 4.2 Collect pump episodes from public enforcement records, each with a source URL
- [ ] 4.3 Collect negatives: news-backed movers, hype without manipulation, matched controls
- [ ] 4.4 Add the dataset report (counts per class and period) and the minimum-count gate

## 5. Training and evaluation (`ml/`)

- [ ] 5.1 Create the Python project with pinned versions and a one-command training entry point
- [ ] 5.2 Train the promotional-language classifier on embeddings from an Apache-2.0 model; record model names and licenses
- [ ] 5.2b Train version 1 on market and catalyst features only, because historical social data is not available for free
- [ ] 5.3 Train LightGBM with monotone-decreasing constraints on catalyst features and time-based cross-validation
- [ ] 5.4 Calibrate with isotonic regression and choose the flag level on held-out data
- [ ] 5.5 Build the evaluation harness: time split, metrics with bootstrap intervals, rule and volume baselines
- [ ] 5.6 Add the catalyst monotonicity test and the promotion gate
- [ ] 5.7 Write the model card generator

## 6. Serving

- [ ] 6.1 Export the model and calibration to ONNX with a stored reference input and expected score
- [ ] 6.2 Implement `OnnxScorer` with ONNX Runtime and the startup self-check
- [ ] 6.3 Fall back to `RuleScorer` on a missing or failing model and test both paths
- [ ] 6.4 Run the replay of the recorded test day through the model scorer and compare with rules
