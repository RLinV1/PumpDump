import json

import numpy as np
import pandas as pd

from pumpml import vol, vol_eval as V
from pumpml.card import MODEL_LICENSE


def test_metrics_by_hand():
    # forecast 1, target 2: ratio 4 -> 4 - ln4 - 1; forecast 2, target 2: ratio 1 -> 0
    m = V.metric_values([1.0, 2.0], [2.0, 2.0], upper=[1.5, 2.0])
    assert np.isclose(m["qlike"], (3 - np.log(4)) / 2)
    assert np.isclose(m["mae_log_range"], 0.5)
    assert m["coverage"] == 0.5


def test_bootstrap_ci_brackets_value():
    day = np.repeat(np.arange(10), 3)
    y = np.linspace(1, 2, 30)
    r = V.boot_ci(day, y * 1.1, y, y * 1.05, n_boot=100)
    for k in ("qlike", "mae_log_range", "coverage"):
        lo, hi = r[k]["ci95"]
        assert lo <= r[k]["value"] <= hi
    assert r["coverage"]["value"] == 1.0


def test_periods_by_percentile_and_explicit():
    te = pd.DataFrame({"timestamp": pd.date_range("2025-01-01", periods=10, freq="D"), "target": np.arange(1, 11) / 10})
    m = V.pick_periods(te)
    assert m["calm"].sum() == 5 and m["stressed"].sum() == 2 and not (m["calm"] & m["stressed"]).any()
    assert te["target"][m["stressed"]].min() > te["target"][m["calm"]].max()
    assert V.pick_periods(te, calm=("2025-01-01", "2025-01-02"))["calm"].sum() == 2


def _report(model_q, har_q):
    p = lambda m, h: {"model": {"qlike": {"value": m}}, "har_rv": {"qlike": {"value": h}}}
    return {"periods": {"calm": p(model_q[0], har_q[0]), "stressed": p(model_q[1], har_q[1])}}


def test_gate_pass_and_fail():
    assert V.gate(_report((0.1, 0.2), (0.3, 0.3)))["promoted"]
    g = V.gate(_report((0.1, 0.4), (0.3, 0.3)))
    assert not g["promoted"] and "stressed" in g["reasons"][0] and g["serving"] == "har_rv baseline"
    assert not V.gate(_report((0.3, 0.3), (0.3, 0.3)))["promoted"]  # a tie is not a win


def test_evaluate_writes_report_flag_and_card(tmp_path, monkeypatch):
    bars = vol.synth_bars(days=30)
    d = tmp_path / "vol-t"
    vol.train(bars, d, "t")
    r = V.evaluate(bars, d, n_boot=20)
    assert set(r["periods"]) == {"calm", "stressed"}
    assert json.loads((d / "report.json").read_text())["gate"] == r["gate"]
    assert (d / "promoted").exists() == r["gate"]["promoted"]
    card = (d / "model-card-vol.md").read_text()
    assert "## Licenses" in card and f"- model vol-t: {MODEL_LICENSE}" in card and "- lightgbm " in card  # license-gate.sh cards
    monkeypatch.setattr(V, "gate", lambda rep: {"promoted": False, "reasons": ["x"], "serving": "har_rv baseline"})
    V.evaluate(bars, d, n_boot=5)
    assert not (d / "promoted").exists()
