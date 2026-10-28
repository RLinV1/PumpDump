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
            return X["filingCount"].to_numpy() / 10

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
    for field in ("## Data", "Model size", "## Metrics", "## Known limits", "## Licenses", "Date:", "Level"):
        assert field in card


def test_gate_blocks_losers_and_violations():
    assert not E.gate(0.5, {"rules": 0.6, "volume": 0.2}, 0)["promoted"]
    assert not E.gate(0.9, {"rules": 0.6, "volume": 0.2}, 2)["promoted"]
    assert not E.gate(0.9, {"rules": 0.6}, 0, current_pr=0.95)["promoted"]
    assert E.gate(0.9, {"rules": 0.6, "volume": 0.2}, 0)["promoted"]


def test_rule_table_matches_docs():
    doc = Path(__file__).parents[2] / "docs" / "rule-scorer.md"
    rows = re.findall(r"^\| [^|]+ \| \w+ \| `(\w+)` \| ([\d.]+) \| (\d+) \|$", doc.read_text(), re.M)
    assert [(f, float(a), int(p)) for f, a, p in rows] == [(f, float(a), p) for f, a, p in RULES]


def test_features_cover_catalyst_group():
    assert set(CATALYST) <= set(FEATURES)
