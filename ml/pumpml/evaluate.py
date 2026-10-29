"""Evaluation harness: time split, decision metrics with bootstrap intervals, baselines, promotion gate."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from . import model as M
from .card import write_card
from .split import three_way

TOP_K = 1  # flags per day counted for "precision among the top flags"


def metrics(df: pd.DataFrame, s: np.ndarray, level: float) -> dict:
    d = df.assign(score=s, day=df["window_end"].dt.date)
    pumps = d[d["label"] == 1]
    pump_days = set(pumps["day"])
    top = d.sort_values("score", ascending=False).groupby("day").head(TOP_K)
    normal = d[~d["day"].isin(pump_days)]
    flagged_normal = normal[normal["score"] >= level]
    leads = []
    for _, ep in pumps.groupby("episode_id"):
        hit = ep[ep["score"] >= level]
        if len(hit):
            leads.append((hit["window_end"].min() - ep["peak_time"].iloc[0]) / pd.Timedelta(minutes=1))
    return {
        "pr_auc": float(average_precision_score(d["label"], s)) if d["label"].any() else float("nan"),
        "precision_top_flags_per_day": float(top["label"].mean()),
        "false_flags_per_normal_day": float(len(flagged_normal) / max(normal["day"].nunique(), 1)),
        # negative = flag came before the peak
        "median_lead_minutes": float(-np.median(leads)) if leads else float("nan"),
    }


def with_ci(df: pd.DataFrame, s: np.ndarray, level: float, n_boot: int = 200, seed: int = 0) -> dict:
    """Point estimate plus 95% interval from resampling whole episodes."""
    d = df.assign(_s=s)
    groups = {k: g for k, g in d.groupby("episode_id")}
    ids = list(groups)
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(n_boot):
        pick = rng.choice(len(ids), len(ids))
        b = pd.concat([groups[ids[i]].assign(episode_id=j) for j, i in enumerate(pick)], ignore_index=True)
        boots.append(metrics(b, b["_s"].to_numpy(), level))
    out = {"n_episodes": len(ids), "n_pump_episodes": int(d.loc[d["label"] == 1, "episode_id"].nunique())}
    for k, v in metrics(df, s, level).items():
        vals = [b[k] for b in boots if not np.isnan(b[k])]
        ci = [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))] if vals else [None, None]
        out[k] = {"value": v, "ci95": ci}
    return out


def gate(cand_pr: float, baseline_pr: dict, violations: int, current_pr: float | None = None) -> dict:
    """Promote only if the candidate beats every baseline (and the current model) and the catalyst test passes."""
    reasons = []
    for name, pr in baseline_pr.items():
        if not cand_pr > pr:
            reasons.append(f"does not beat {name} baseline on PR-AUC ({cand_pr:.3f} vs {pr:.3f})")
    if current_pr is not None and not cand_pr > current_pr:
        reasons.append(f"does not beat current model ({cand_pr:.3f} vs {current_pr:.3f})")
    if violations:
        reasons.append(f"catalyst monotonicity: {violations} violations")
    return {"promoted": not reasons, "reasons": reasons}


def evaluate(df: pd.DataFrame, model_dir: Path, data_note: str, current_dir: Path | None = None, n_boot: int = 200) -> dict:
    booster, iso, info = M.load(model_dir)
    tr, cal, test = three_way(df)
    rule_cal, vol = M.rule_score(cal), M.VolumeBaseline(tr)
    entries = {  # name -> (test scores, flag level)
        "model": (M.score(booster, iso, test), info["flag_level"]),
        "rules": (M.rule_score(test), M.flag_level(rule_cal, cal["label"])),
        "volume": (vol.score(test), M.flag_level(vol.score(cal), cal["label"])),
    }
    report = {"data": data_note, "test_windows": len(test), "flag_levels": {k: v[1] for k, v in entries.items()}}
    for name, (s, level) in entries.items():
        # a baseline that never reaches the target precision flags nothing
        report[name] = with_ci(test, s, level if level is not None else float("inf"), n_boot)
    violations = M.catalyst_violations(booster, iso, test)
    current_pr = None
    if current_dir and (current_dir / "report.json").exists():
        current_pr = json.loads((current_dir / "report.json").read_text())["model"]["pr_auc"]["value"]
    report["catalyst_violations"] = violations
    report["gate"] = gate(report["model"]["pr_auc"]["value"],
                          {k: report[k]["pr_auc"]["value"] for k in ("rules", "volume")}, violations, current_pr)
    (model_dir / "report.json").write_text(json.dumps(report, indent=2))
    if report["gate"]["promoted"]:
        write_card(model_dir, info, report, df, tr)
    return report
