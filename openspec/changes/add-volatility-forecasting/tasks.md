## 1. Data and baseline

- [x] 1.1 Build one-minute range targets from historical bars for the watchlist, with a time-based train, validation and test split
- [x] 1.2 Implement the HAR-RV baseline and a naive last-hour baseline, and record their scores
- [ ] 1.3 Add `swing` (median, upper band, regime) to the shared `Score` record with a schema version bump

## 2. Model

- [ ] 2.1 Train LightGBM quantile models at the 50th and 90th percentiles on the feature set
- [ ] 2.2 Fit the coverage correction on the validation period
- [ ] 2.3 Export to ONNX and add a `VolatilityScorer` to the JVM scorer module, with the baseline as fallback

## 3. Evaluation

- [ ] 3.1 Report QLIKE loss, mean absolute error of the log range, and band coverage with confidence intervals
- [ ] 3.2 Evaluate separately on a calm period and a stressed period
- [ ] 3.3 Enforce the promotion gate: the model replaces the baseline only if it beats it on both periods

## 4. Surfaces

- [ ] 4.1 Return the forecast from the score endpoint and the live stream
- [ ] 4.2 Show expected swing and regime in the web evidence panel, replacing the placeholder rolling figure
- [ ] 4.3 Add the "size of move, not direction" notice next to the figure
