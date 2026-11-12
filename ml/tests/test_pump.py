import json
import re
from pathlib import Path

import numpy as np
import pytest

from pumpml import evaluate as E
from pumpml import model as M
from pumpml import synth
from pumpml.features import CATALYST, FEATURES, RULES
from pumpml.split import three_way, time_folds


@pytest.fixture(scope="module")
def df():
    return synth.make_pump_dataset()


@pytest.fixture(scope="module")
def trained(df, tmp_path_factory):
    d = tmp_path_factory.mktemp("models") / "t"
    M.train(df, d)
    return d


def test_synthetic_is_deterministic(df):
    assert df.equals(synth.make_pump_dataset())


def test_split_is_time_ordered_and_keeps_episodes_whole(df):
    tr, cal, te = three_way(df)
    for a, b in ((tr, cal), (cal, te), (tr, te)):
        assert a["window_end"].max() < b["window_end"].min()
        assert not set(a["episode_id"]) & set(b["episode_id"])
    assert len(te) > 0 and len(tr) > len(te)
    for t, v in time_folds(tr):
        assert t["window_end"].max() < v["window_end"].min()


def test_train_refuses_tiny_dataset(df, tmp_path):
    few = df[(df["label"] == 0) | (df["episode_id"].isin(df.loc[df["label"] == 1, "episode_id"].unique()[:3]))]
    with pytest.raises(SystemExit):
        M.train(few, tmp_path)


def test_catalyst_cannot_raise_score(df, trained):
    booster, iso, _ = M.load(trained)
    assert M.catalyst_violations(booster, iso, df) == 0


def test_monotone_check_catches_violation(df):
    class Rising:  # a model that rewards catalysts
        def predict(self, X):
            return X["filings24h"].to_numpy() / 10

    class Id:
        def predict(self, x):
            return np.asarray(x)

    assert M.catalyst_violations(Rising(), Id(), df) > 0


def test_flag_level_comes_from_held_out_data(trained):
    info = json.loads((trained / "model.json").read_text())
    assert info["flag_level"] is not None and 0 <= info["flag_level"] <= 100
    assert info["calibrated_on"]["windows"] > 0


def test_flag_level_none_when_target_unreachable():
    assert M.flag_level([10, 20, 30, 40, 50, 60], [0, 0, 0, 0, 0, 0]) is None


def test_evaluate_reports_and_promotes_with_card(df, trained):
    r = E.evaluate(df, trained, "SYNTHETIC", n_boot=20)
    for scorer in ("model", "rules", "volume"):
        for k in ("pr_auc", "precision_top_flags_per_day", "false_flags_per_normal_day", "median_lead_minutes"):
            assert {"value", "ci95"} <= set(r[scorer][k])
    assert r["model"]["n_pump_episodes"] > 0
    assert r["catalyst_violations"] == 0
    # news-backed movers fool the rules; the model should beat them on the fixture
    assert r["gate"]["promoted"], r["gate"]
    card = (trained / "model-card.md").read_text()
    for field in ("## Data", "Model size", "## Metrics", "## Known limits", "## Licenses", "- model ", "Date:", "Level"):
        assert field in card


def test_gate_blocks_losers_and_violations():
    assert not E.gate(0.5, {"rules": 0.6, "volume": 0.2}, 0)["promoted"]
    assert not E.gate(0.9, {"rules": 0.6, "volume": 0.2}, 2)["promoted"]
    assert not E.gate(0.9, {"rules": 0.6}, 0, current_pr=0.95)["promoted"]
    assert E.gate(0.9, {"rules": 0.6, "volume": 0.2}, 0)["promoted"]


def test_rule_table_matches_docs():
    doc = Path(__file__).parents[2] / "docs" / "ml" / "rule-scorer.md"
    table = doc.read_text().split("## Rule table")[1].split("\n## ")[0]
    rows = re.findall(r"^\| [^|]+ \| \w+ \| `(\w+)` \| ([\d.]+) \| (-?\d+) \|$", table, re.M)
    assert [(f, float(a), int(p)) for f, a, p in rows] == [(f, float(a), p) for f, a, p in RULES]


def test_features_cover_catalyst_group():
    assert set(CATALYST) <= set(FEATURES)


def test_onnx_export_matches_python_model(trained, df):
    import onnxruntime as ort
    booster, iso, info = M.load(trained)
    ref = json.loads((trained / "reference.json").read_text())
    sess = ort.InferenceSession(str(trained / "model.onnx"))
    x = np.array([[ref["features"][f] for f in info["features"]]], dtype=np.float32)
    p = float(sess.run(["probabilities"], {"input": x})[0][0, 1])
    cal = info["calibration"]
    onnx_score = 100 * float(np.interp(p, cal["x"], cal["y"]))  # what the JVM does
    assert abs(onnx_score - ref["expected_score"]) < 1e-5
    assert 0 < ref["expected_score"] < 100
    got = sess.run(["probabilities"], {"input": df[info["features"]].to_numpy(np.float32)})[0][:, 1]
    assert np.abs(got - booster.predict(df[info["features"]])).max() < 1e-5


def test_gate_rejects_missing_flag_level():
    g = E.gate(0.9, {"rules": 0.6}, 0, flag_level=None)
    assert not g["promoted"] and "no flag level reaches target precision" in g["reasons"]


def test_card_renders_missing_flag_level(df, trained, tmp_path):
    import shutil
    from pumpml.card import write_card
    d = tmp_path / "m"
    shutil.copytree(trained, d)
    info = {**json.loads((d / "model.json").read_text()), "flag_level": None}
    r = E.evaluate(df, trained, "SYNTHETIC", n_boot=5)
    write_card(d, info, r, df, df.head(5))
    assert "Level none of 100" in (d / "model-card.md").read_text()


def test_no_report_when_card_fails(df, trained, tmp_path, monkeypatch):
    import shutil
    d = tmp_path / "m"
    shutil.copytree(trained, d)
    (d / "report.json").unlink(missing_ok=True)
    (d / "model-card.md").unlink(missing_ok=True)

    def boom(*a, **k):
        raise RuntimeError("card failed")
    monkeypatch.setattr(E, "write_card", boom)
    with pytest.raises(RuntimeError):
        E.evaluate(df, d, "SYNTHETIC", n_boot=5)
    assert not (d / "report.json").exists()


def test_current_model_is_scored_on_the_new_test_split(df, trained, tmp_path):
    import shutil
    new, cur = tmp_path / "new", tmp_path / "cur"
    shutil.copytree(trained, new)
    shutil.copytree(trained, cur)
    # stale report from another period claims a weak model; the same model scored now ties, so it must not win
    (cur / "report.json").write_text(json.dumps({"model": {"pr_auc": {"value": 0.0}}}))
    r = E.evaluate(df, new, "SYNTHETIC", current_dir=cur, n_boot=5)
    assert not r["gate"]["promoted"]
    assert any("does not beat current model" in x for x in r["gate"]["reasons"])


def test_unloadable_current_model_means_no_current_model(df, trained, tmp_path, caplog):
    import shutil
    new, cur = tmp_path / "new", tmp_path / "cur"
    shutil.copytree(trained, new)
    cur.mkdir()
    (cur / "model.json").write_text("{not json")
    r = E.evaluate(df, new, "SYNTHETIC", current_dir=cur, n_boot=5)
    assert r["gate"]["promoted"], r["gate"]
    assert "cannot score current model" in caplog.text
