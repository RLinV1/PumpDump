# Proposal

## Why

Pumpwatch answers one question: is this move hype or real. Retail investors also need the next question answered: how far could this ticker swing from here. Today nothing estimates that, so a user cannot size a position or tell a calm stock from one that routinely moves 15 percent in an hour. A learned volatility forecast turns the product from a single alert into a risk view of each ticker.

## What Changes

- Add a volatility forecaster that predicts the next hour's price range for a ticker, as a median and an upper band, from market and catalyst features.
- Report the forecast as an expected swing in percent and a regime (calm, elevated, extreme) measured against that ticker's own history.
- Start with a transparent baseline (a heterogeneous autoregressive model of realized volatility) and promote a gradient-boosted quantile model only when it beats the baseline on a time-based split.
- Feed the pump score and chatter features into the forecaster, so hype raises the expected swing before price moves.
- Expose the forecast through the same score record, the API and the web view.
- Out of scope: portfolio-level analytics, position sizing advice, and anything that tells a user to buy or sell.

## Capabilities

### New Capabilities
- `volatility-forecast`: Predict and report the next-hour swing and regime for a ticker, with a baseline, calibration and a promotion gate.

### Modified Capabilities
<!-- None. -->

## Impact

- Reuses the windowed market features from `add-pump-scoring-model` and the Alpaca historical bars already needed for labels. No new data source, no cost.
- New code: a Python training and evaluation project for the forecaster, an ONNX model served in the JVM next to the pump scorer, and a `swing` field added to the shared `Score` record.
- Dependencies are the same permissive set: LightGBM, scikit-learn, ONNX Runtime.
- Compliance: the forecast is a statistical estimate, shown with the same not-investment-advice notice as the flags.
