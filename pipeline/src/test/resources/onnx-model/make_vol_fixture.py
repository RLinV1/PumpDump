"""Regenerate vol-fixture-v1/ (median.onnx, upper.onnx, model.json, reference.json) from synthetic bars. No real data.

Run from the repo root: python pipeline/src/test/resources/onnx-model/make_vol_fixture.py   (needs ml/ requirements)
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[4] / "ml"))
from pumpml import vol  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    vol.train(vol.synth_bars(days=30), Path(tmp), "fixture-v1")
    out = here / "vol-fixture-v1"
    out.mkdir(exist_ok=True)
    for f in ("median.onnx", "upper.onnx", "model.json", "reference.json"):
        shutil.copy(Path(tmp) / f, out / f)

# HAR-RV fallback expectations from vol.py itself (log-range median and corrected band), for VolatilityScorerTest
info = json.loads((out / "model.json").read_text())
ref = json.loads((out / "reference.json").read_text())
har = vol.HarRV()
har.coef = np.array(info["har_coef"])
med = float(har.predict(pd.DataFrame([ref["features"]]))[0])
ref["expected_har_median"] = med
ref["expected_har_upper"] = max(med + info["har_band_shift"], med)
(out / "reference.json").write_text(json.dumps(ref, indent=2))
