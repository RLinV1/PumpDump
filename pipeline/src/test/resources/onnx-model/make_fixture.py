"""Regenerate fixture-v1/ (model.onnx, model.json, reference.json) from the synthetic dataset. No real data involved.

Run from the repo root: python pipeline/src/test/resources/onnx-model/make_fixture.py   (needs ml/ requirements)
"""
import shutil
import sys
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[4] / "ml"))
from pumpml import model, synth  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    model.train(synth.make_pump_dataset(), Path(tmp))
    out = here / "fixture-v1"
    out.mkdir(exist_ok=True)
    for f in ("model.onnx", "model.json", "reference.json"):
        shutil.copy(Path(tmp) / f, out / f)
