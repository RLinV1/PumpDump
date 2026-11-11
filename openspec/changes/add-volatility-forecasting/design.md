## Context

The pump scorer is a classifier. Volatility is a regression problem with a known, well-studied structure: volatility clusters, so recent realized volatility is the strongest predictor. The model must stay explainable and must not claim certainty.

## Goals / Non-Goals

**Goals:**
- Predict the next 60 minutes of price range per ticker, updated every 15 seconds.
- Beat a standard baseline on held-out time periods, or ship the baseline and say so.
- Give honest uncertainty: a band whose observed coverage matches its stated level.

**Non-Goals:**
- Daily or longer horizons, option pricing, portfolio risk, or trade advice.

## Decisions

### Target
The target is the realized range over the next 60 minutes: the log of high over low, computed from one-minute bars. Range is robust, easy to explain ("it moved 11 percent top to bottom") and available free from historical bars.

### Baseline
A heterogeneous autoregressive model of realized volatility (HAR-RV): the forecast is a linear mix of the last 5-minute, 30-minute and one-day realized volatility. It is fitted by ordinary least squares, needs no tuning and is the standard thing to beat.

### Main model
LightGBM quantile regression at the 50th and 90th percentiles, giving a median swing and an upper band. Features: HAR terms, volume ratio, spread, time of day, gap from the previous close, the pump score, chatter ratio, new-account share, and whether a filing or news item exists in the lookback. Exported to ONNX and served in the JVM with the pump scorer.

### Regime
The regime compares the median forecast with the ticker's own trailing 20-day distribution of hourly ranges: below the 50th percentile is calm, 50th to 90th is elevated, above the 90th is extreme. This keeps a penny stock and a large-cap from sharing one absolute scale.

Interim rule in the JVM (`VolatilityScorer`): the pipeline holds no per-ticker history of hourly ranges yet, so the regime compares the median forecast with the range a driftless random walk would show at the ticker's own one-day realized volatility (`sigma_hour = rvd * sqrt(60/390)`). Below 1.5 `sigma_hour` (the median of that range) is calm, 1.5 to 2.3 (its 90th percentile) is elevated, above is extreme. Replace it with the trailing 20-day distribution above once that history is available.

### Serving and fallback
Both boosters are exported to `median.onnx` and `upper.onnx` with a `reference.json` self-check; the coverage shift is applied in the JVM (`max(max(upper, median) + shift, median)`). If the directory is absent, corrupt or fails the self-check, the JVM serves the HAR-RV baseline: fitted coefficients and a 90 percent band shift from `model.json` when readable, otherwise a documented default (hourly Brownian range at the day's volatility, band x1.5). With no one-day realized volatility available there is no forecast (`swing` is null), which is the "not enough history" case.

### Live features
The pipeline builds the six model inputs exactly as `ml/pumpml/vol.py build()` defines them, from one-minute bars (`Bars`, kept per ticker in the `vol-bars` store and fed by closed 15 second panes). `rv5`, `rv30` and `rvd` are square roots (volatilities, not variances) of the summed squared one-bar log-close returns over the last 5, 30 and 390 bars; `vol_ratio` is the mean volume of the last 30 bars over the last 390 (not the window-vs-baseline `volumeRatio`, which only the rule scorer and pump model use); `tod` is the start minute of the latest complete bar in New York time; `gap` is `log(first open of the day / previous day's last close)`, 0 when there is no previous day. Decisions:
- Windows count bars, not clock minutes, as vol.py does (a minute with no trade has no bar), so a thin ticker needs more than 6.5 hours of wall time to fill 390 bars.
- `rv5`/`rv30` appear after 6/31 bars, `rvd` and `vol_ratio` after 391 bars. Below 31 bars `swing` is null ("not enough history").
- Warm-up, 31 to 390 bars: `Bars` also emits `rvd_est = sqrt(sum of squared one-bar log returns over the n bars so far) * sqrt(390/n)`. While `rvd` is absent the scorer serves the default HAR baseline on `rvd_est` (median = `rvd_est * sqrt(8/pi) * sqrt(60/390)`, upper x1.5, regime by the usual rule). `rvd_est` is never given to the ONNX models or the fitted HAR, which were trained on full-day `rvd`. At 391 bars the normal path takes over. `Score`/`Swing` carry no model version, so the schema is unchanged.
- `model.json` must have `format >= 2` and `|har_band_shift| < 1`; otherwise the directory is refused and the default baseline is served, as for a missing model (older `train()` could write a bogus shift of about 5).
- Day boundaries are America/New_York calendar dates; the previous close is the last bar close of the prior date with bars.
- A bar's open is the last trade of its first traded second (panes keep one price per second), so it can differ slightly from the exact first trade; the close is exact to the second.
- The features are added to every window length's output; the scorer reads the 5 minute scoring window's copy.

### Calibration
Quantile outputs are checked by coverage: the 90th percentile band must contain the realized range about 90 percent of the time on held-out data. If it does not, the displayed band is widened by a fitted factor.

## Risks / Trade-offs

- [Volatility is hard to forecast for new listings and thin stocks] -> Show the forecast only when the ticker has enough history, otherwise show "not enough history".
- [A model can look good in calm weeks and fail in a shock] -> Evaluate across a stressed period as well as a calm one and report both.
- [Users may read a swing figure as a prediction of direction] -> Label it as size of move, never direction, in every surface.

### Evaluation and promotion gate
Evaluation runs on the held-out test split only. Each forecaster (model median, HAR-RV, naive last hour) is scored with QLIKE on squared range, mean absolute error of the log range, and, for the model's upper band only (baselines have no band), 90% coverage. Every metric has a 95% interval from a bootstrap that resamples whole days, because rows within a day are correlated.

Periods are chosen by rank of realized volatility: each test day is scored by the mean realized log range of its rows, the calm period is the days at or below the 50th percentile and the stressed period is the days at or above the 80th. The owner can instead pass explicit date ranges (`--calm START END`, `--stressed START END`), for example a known shock week.

The gate promotes the model only if its QLIKE is strictly lower than HAR-RV's in both periods. Otherwise the report says the baseline ships. The run writes `report.json`, `model-card-vol.md` and, only on a pass, a `promoted` file in the model directory (a failed re-run removes a stale one).
