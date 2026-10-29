"""Train, calibrate and store the pump model; baselines; catalyst monotonicity check."""
import datetime
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score

from .features import CATALYST, FEATURES, RULES
from .split import three_way, time_folds

SEED = 0
MIN_PUMP_EPISODES = 20  # shortcut: placeholder until the dataset gate (#34, 4.4) defines the real minimum
TARGET_PRECISION = 0.6


def _fit(train: pd.DataFrame) -> lgb.Booster:
    y = train["label"].to_numpy()
    clf = lgb.LGBMClassifier(
        n_estimators=150, learning_rate=0.05, num_leaves=8, min_child_samples=5,
        scale_pos_weight=(y == 0).sum() / max((y == 1).sum(), 1),  # class weight: pumps are rare
        monotone_constraints=[-1 if f in CATALYST else 0 for f in FEATURES],
        random_state=SEED, deterministic=True, force_row_wise=True, n_jobs=1, verbose=-1,
    )
    clf.fit(train[FEATURES], y)
    return clf.booster_


def cv_pr_auc(train: pd.DataFrame, k: int = 3) -> list[float]:
    """PR-AUC on each expanding-window fold; shows how the model decays going forward in time."""
    out = []
    for tr, va in time_folds(train, k):
        if tr["label"].nunique() < 2 or va["label"].nunique() < 2:
            continue
        out.append(float(average_precision_score(va["label"], _fit(tr).predict(va[FEATURES]))))
    return out


def flag_level(score, label, target: float = TARGET_PRECISION, min_flagged: int = 5):
    """Lowest level whose flags reach the target precision on held-out data, or None."""
    score, label = np.asarray(score), np.asarray(label)
    for c in np.unique(score):
        hit = score >= c
        if hit.sum() >= min_flagged and label[hit].mean() >= target:
            return float(c)
    return None


def score(booster, iso, X: pd.DataFrame) -> np.ndarray:
    return 100 * iso.predict(booster.predict(X[FEATURES]))


def train(df: pd.DataFrame, out_dir: Path) -> dict:
    """Fit on the train split, calibrate and pick the flag level on the calibration split, write artifacts."""
    n_pump = df.loc[df["label"] == 1, "episode_id"].nunique()
    if n_pump < MIN_PUMP_EPISODES:
        raise SystemExit(f"refusing to train: {n_pump} pump episodes, minimum is {MIN_PUMP_EPISODES}")
    tr, cal, _ = three_way(df)
    booster = _fit(tr)
    iso = IsotonicRegression(y_min=0, y_max=1, out_of_bounds="clip").fit(booster.predict(cal[FEATURES]), cal["label"])
    level = flag_level(100 * iso.predict(booster.predict(cal[FEATURES])), cal["label"])
    out_dir.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(out_dir / "model.txt"))
    info = {
        "features": FEATURES, "seed": SEED, "flag_level": level, "target_precision": TARGET_PRECISION,
        "calibration": {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()},
        "calibrated_on": {"date": datetime.date.today().isoformat(), "windows": len(cal),
                          "pump_episodes": int(cal.loc[cal["label"] == 1, "episode_id"].nunique())},
        "cv_pr_auc": cv_pr_auc(tr),
    }
    (out_dir / "model.json").write_text(json.dumps(info, indent=2))
    return info


def load(model_dir: Path):
    info = json.loads((model_dir / "model.json").read_text())
    cal = info["calibration"]
    iso = IsotonicRegression(y_min=0, y_max=1, out_of_bounds="clip").fit(cal["x"], cal["y"])
    return lgb.Booster(model_file=str(model_dir / "model.txt")), iso, info


# --- baselines -------------------------------------------------------------------------------------------------

def rule_score(df: pd.DataFrame) -> np.ndarray:
    """rules-v1 from docs/rule-scorer.md; terms whose feature is absent (social, in v1) add nothing."""
    pts = {}
    for feat, at_least, p in RULES:
        if feat in df:
            pts[feat] = np.maximum(pts.get(feat, 0), np.where(df[feat] >= at_least, p, 0))
    return np.minimum(sum(pts.values()), 100)


class VolumeBaseline:
    """Percentile rank of volumeRatio against the training set.
    shortcut: the spec asks for chatter volume; social data is missing in v1, so market volume stands in."""

    def __init__(self, train: pd.DataFrame):
        self.ref = np.sort(train["volumeRatio"].to_numpy())

    def score(self, df: pd.DataFrame) -> np.ndarray:
        return 100 * np.searchsorted(self.ref, df["volumeRatio"].to_numpy()) / len(self.ref)


# --- catalyst monotonicity -------------------------------------------------------------------------------------

def catalyst_violations(booster, iso, X: pd.DataFrame) -> int:
    """Rows where adding catalyst evidence raised the score. Must be 0 (promotion gate)."""
    base = score(booster, iso, X)
    bad = 0
    for f in CATALYST:
        for bump in (1, 3):
            Z = X.copy()
            Z[f] = Z[f] + bump
            bad += int((score(booster, iso, Z) > base + 1e-9).sum())
    return bad
