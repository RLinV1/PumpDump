# ml

Offline training side of Pumpwatch (the streaming side is Java). Python 3.11+.

```
pip install -r requirements-dev.txt
python -m pytest
python -m pumpml train --synthetic --out models --version v1      # LightGBM + isotonic calibration + flag level
python -m pumpml evaluate --synthetic --out models --version v1   # time split, CIs, baselines, gate, model card
python -m pumpml vol-baseline --synthetic                         # HAR-RV and naive last-hour baselines
```

Use `--data labels.csv` (columns: `episode_id, ticker, kind, label, window_end, peak_time`, then the feature names in
`pumpml/features.py`) once the labeled dataset exists (issue #34), and `--bars bars.csv --watchlist A B` for volatility
(one-minute bars: `ticker, timestamp, open, high, low, close, volume`).

`--synthetic` data is made up: it proves the code runs, not that a model works. Outputs go to `models/` (gitignored).
The model card is written only when the promotion gate passes.

Not here yet: promotional-language classifier (needs social text), ONNX export, volatility model and evaluation.
