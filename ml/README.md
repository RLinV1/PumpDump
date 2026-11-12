# ml

Offline training side of Pumpwatch (the streaming side is Java). Python 3.12+ (required by the pinned NumPy version).

```
pip install -r requirements-dev.txt
python -m pytest
python -m pumpml train --synthetic --out models --version v1      # LightGBM + isotonic calibration + flag level
python -m pumpml evaluate --synthetic --out models --version v1   # time split, CIs, baselines, gate, model card
python -m pumpml vol-baseline --synthetic                         # HAR-RV and naive last-hour baselines
python -m pumpml vol-train --synthetic                            # quantile models + coverage shift -> models/vol-dev/
# owner, real bars (stays local): python -m pumpml vol-train --bars bars.csv --watchlist A B --version 1
```

Volatility models trained before `model.json` got `"format": 2` (and the `har_band_shift` fix) are refused by the JVM,
which serves the default baseline instead. Retrain them with `vol-train`.

Use `--data labels.csv` (columns: `episode_id, ticker, kind, label, window_end, peak_time`, then the feature names in
`pumpml/features.py`) once the labeled dataset exists (issue #34), and `--bars bars.csv --watchlist A B` for volatility
(one-minute bars: `ticker, timestamp, open, high, low, close, volume`).

`--synthetic` data is made up: it proves the code runs, not that a model works. Outputs go to `models/` (gitignored).
The model card is written only when the promotion gate passes.

Promotional-language classifier (offline only, nothing serves it yet):

```
pip install -r requirements-embed.txt
# download the MIT-licensed PumpSense corpus yourself (github.com/AhmedMahrous00/icbc_2026_reproducibility, chat_data/), keep it out of git
python -m pumpml promo-train --data <chat_data folder> --version v1   # -> models/promo-v1/{model.json,model-card.md}
```

It separates pump-announcement messages from other chatter in crypto pump groups, with a time split and bootstrap intervals. It is not
validated on stock posts. Raw text is never written; the default model is 384 coefficients. See the model card for licenses.

Add `--finetune` to fine-tune the MiniLM encoder with a linear head instead (needs a CUDA GPU; it exits rather than fall back to CPU).
It saves the weights under `models/promo-<v>/encoder/` (gitignored) and `model.json` gets `"kind": "finetuned"`; `score()` loads either kind.

Embedding 170k messages takes about 40 minutes on CPU. sentence-transformers uses the GPU when PyTorch sees one, so install the
CUDA build of torch from download.pytorch.org (pick the wheel for your driver) before `requirements-embed.txt` to cut that to minutes.
