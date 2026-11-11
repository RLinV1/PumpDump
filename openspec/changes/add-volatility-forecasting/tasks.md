## 1. Data and baseline

- [x] 1.1 Build one-minute range targets from historical bars for the watchlist, with a time-based train, validation and test split
- [x] 1.2 Implement the HAR-RV baseline and a naive last-hour baseline, and record their scores
- [x] 1.3 Add `swing` (median, upper band, regime) to the shared `Score` record with a schema version bump

## 2. Model

- [x] 2.1 Train LightGBM quantile models at the 50th and 90th percentiles on the feature set. Version 1 trains on HAR terms, volume ratio, time of day and gap only; spread, pump score, chatter ratio, new-account share and the filing/news flag have no free history and are added once it exists. Owner command, from `ml/`: `python -m pumpml vol-train --bars bars.csv --watchlist A B --version 1` (writes `models/vol-1/`, gitignored)
- [x] 2.2 Fit the coverage correction on the validation period (log-space shift, stored in `model.json` as `coverage_shift`)
- [ ] 2.3 Export to ONNX and add a `VolatilityScorer` to the JVM scorer module, with the baseline as fallback

## 3. Evaluation

- [ ] 3.1 Report QLIKE loss, mean absolute error of the log range, and band coverage with confidence intervals
- [ ] 3.2 Evaluate separately on a calm period and a stressed period
- [ ] 3.3 Enforce the promotion gate: the model replaces the baseline only if it beats it on both periods

## 4. Surfaces

- [x] 4.1 Return the forecast from the score endpoint and the live stream
- [x] 4.2 Show expected swing and regime in the web evidence panel, replacing the placeholder rolling figure
- [x] 4.3 Add the "size of move, not direction" notice next to the figure
