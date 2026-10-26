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

### Calibration
Quantile outputs are checked by coverage: the 90th percentile band must contain the realized range about 90 percent of the time on held-out data. If it does not, the displayed band is widened by a fitted factor.

## Risks / Trade-offs

- [Volatility is hard to forecast for new listings and thin stocks] -> Show the forecast only when the ticker has enough history, otherwise show "not enough history".
- [A model can look good in calm weeks and fail in a shock] -> Evaluate across a stressed period as well as a calm one and report both.
- [Users may read a swing figure as a prediction of direction] -> Label it as size of move, never direction, in every surface.
