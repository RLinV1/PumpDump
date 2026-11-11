"""Regenerate vol-bars-fixture.json: two days of synthetic one-minute bars (New York wall-clock times) and the features
ml/pumpml/vol.py build() computes for them, which BarsParityTest checks the JVM against. No real data.

Run from the repo root: python pipeline/src/test/resources/onnx-model/make_vol_bars_fixture.py   (needs ml/ requirements)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[4] / "ml"))
from pumpml import vol  # noqa: E402

rng = np.random.default_rng(7)
per_day, days = 250, 2
n = per_day * days
close = 20 * np.exp(np.cumsum(0.001 * rng.normal(size=n)))
open_ = close * np.exp(0.0005 * rng.normal(size=n))
ts = np.concatenate([pd.date_range(f"2026-01-0{5 + d} 09:30", periods=per_day, freq="min") for d in range(days)])
bars = pd.DataFrame({"ticker": "AAA", "timestamp": ts, "open": open_, "high": np.maximum(open_, close) * 1.0005,
                     "low": np.minimum(open_, close) * 0.9995, "close": close,
                     "volume": rng.integers(100, 5000, size=n).astype(float)})
vol.STEP = 1  # every minute, not every 15th
rows = vol.build(bars)
out = {"bars": [{"t": t.strftime("%Y-%m-%dT%H:%M"), "open": o, "close": c, "volume": v}
                for t, o, c, v in zip(bars["timestamp"], bars["open"], bars["close"], bars["volume"])],
       "expected": [{"t": r.timestamp.strftime("%Y-%m-%dT%H:%M"), **{c: float(getattr(r, c)) for c in vol.FEATURES}}
                    for r in rows.itertuples()]}
assert len(out["expected"]) > 40 and any(abs(e["gap"]) > 0 for e in out["expected"])
(here / "vol-bars-fixture.json").write_text(json.dumps(out))
print(len(out["expected"]), "expected rows")
