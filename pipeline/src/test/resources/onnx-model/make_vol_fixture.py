"""Regenerate vol-fixture-v1/ (median.onnx, upper.onnx, model.json, reference.json) from synthetic bars. No real data.

Run from the repo root: python pipeline/src/test/resources/onnx-model/make_vol_fixture.py   (needs ml/ requirements)
"""
import shutil
import sys
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[4] / "ml"))
from pumpml import vol  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    vol.train(vol.synth_bars(days=30), Path(tmp), "fixture-v1")
    out = here / "vol-fixture-v1"
    out.mkdir(exist_ok=True)
    for f in ("median.onnx", "upper.onnx", "model.json", "reference.json"):
        shutil.copy(Path(tmp) / f, out / f)
