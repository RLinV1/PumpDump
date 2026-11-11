"""Volatility evaluation and promotion gate (add-volatility-forecasting 3.1-3.3).

Scores the quantile model, HAR-RV and the naive last-hour baseline on the held-out test split, separately on a calm
and a stressed period, with 95% intervals from resampling whole days. The model is promoted only if it beats HAR-RV
on QLIKE in BOTH periods; otherwise the report says the baseline ships."""
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from . import vol

CALM_MAX_PCT = 50.0      # calm: test days at or below this percentile of daily mean log range
STRESSED_MIN_PCT = 80.0  # stressed: test days at or above this percentile


def _terms(fc, y):
    r = (np.asarray(y) / np.asarray(fc)) ** 2
    return {"qlike": r - np.log(r) - 1, "mae_log_range": np.abs(np.asarray(fc) - np.asarray(y))}


def metric_values(fc, y, upper=None) -> dict:
    out = {k: float(v.mean()) for k, v in _terms(fc, y).items()}
    if upper is not None:
        out["coverage"] = vol.coverage(y, upper)
    return out


def boot_ci(day, fc, y, upper=None, n_boot: int = 200, seed: int = 0) -> dict:
    """Point estimate and 95% interval per metric, resampling whole days (rows within a day are correlated)."""
    day = np.asarray(day)
    cols = _terms(fc, y)
    if upper is not None:
        cols["coverage"] = (np.asarray(y) <= np.asarray(upper)).astype(float)
    days = np.unique(day)
    idx = {d: np.flatnonzero(day == d) for d in days}
    rng = np.random.default_rng(seed)
    boots = {k: [] for k in cols}
    for _ in range(n_boot):
        pick = np.concatenate([idx[d] for d in rng.choice(days, len(days))])
        for k, v in cols.items():
            boots[k].append(v[pick].mean())
    return {k: {"value": float(v.mean()), "ci95": [float(np.percentile(boots[k], 2.5)), float(np.percentile(boots[k], 97.5))]}
            for k, v in cols.items()}


def pick_periods(test: pd.DataFrame, calm=None, stressed=None) -> dict:
    """Calm / stressed row masks. Default rule: rank test days by mean log range; calm = days at or below the 50th
    percentile, stressed = days at or above the 80th. `calm` / `stressed` may be explicit (start, end) date pairs."""
    day = test["timestamp"].dt.normalize()
    level = test.groupby(day)["target"].mean()
    masks = {}
    for name, rng_, rule in (("calm", calm, level <= np.percentile(level, CALM_MAX_PCT)),
                             ("stressed", stressed, level >= np.percentile(level, STRESSED_MIN_PCT))):
        if rng_:
            masks[name] = ((day >= pd.Timestamp(rng_[0])) & (day <= pd.Timestamp(rng_[1]))).to_numpy()
        else:
            masks[name] = day.isin(level.index[rule]).to_numpy()
    return masks


def gate(report: dict) -> dict:
    """Promote only if the model beats HAR-RV on QLIKE in both periods."""
    reasons = []
    for p, r in report["periods"].items():
        m, h = r["model"]["qlike"]["value"], r["har_rv"]["qlike"]["value"]
        if not m < h:
            reasons.append(f"does not beat HAR-RV on QLIKE in the {p} period ({m:.4f} vs {h:.4f})")
    return {"promoted": not reasons, "reasons": reasons, "serving": "model" if not reasons else "har_rv baseline"}


def evaluate(bars: pd.DataFrame, model_dir: Path, calm=None, stressed=None, n_boot: int = 200) -> dict:
    model_dir = Path(model_dir)
    info = json.loads((model_dir / "model.json").read_text())
    med_b = lgb.Booster(model_file=str(model_dir / "median.txt"))
    up_b = lgb.Booster(model_file=str(model_dir / "upper.txt"))
    tr, _, te = vol.split(vol.build(bars))
    har = vol.HarRV().fit(tr)
    med, up = vol.predict_band(med_b, up_b, info["coverage_shift"], te)
    fcs = {"model": np.maximum(med, 1e-6), "har_rv": har.predict(te), "naive_last_hour": np.maximum(te["naive"].to_numpy(), 1e-6)}
    masks = pick_periods(te, calm, stressed)
    report = {"model_version": info["version"], "test_rows": len(te), "n_boot": n_boot,
              "period_rule": {"calm": list(map(str, calm)) if calm else f"test days with mean log range <= p{CALM_MAX_PCT:g}",
                              "stressed": list(map(str, stressed)) if stressed else f"test days with mean log range >= p{STRESSED_MIN_PCT:g}"},
              "periods": {}}
    for p, mask in masks.items():
        if not mask.any():
            raise SystemExit(f"no test rows in the {p} period")
        y, day = te["target"].to_numpy()[mask], te["timestamp"].dt.date.to_numpy()[mask]
        r = {"rows": int(mask.sum()), "days": int(len(set(day)))}
        for name, fc in fcs.items():
            r[name] = boot_ci(day, fc[mask], y, up[mask] if name == "model" else None, n_boot)  # baselines have no band
        report["periods"][p] = r
    report["gate"] = gate(report)
    (model_dir / "report.json").write_text(json.dumps(report, indent=2))
    if report["gate"]["promoted"]:
        (model_dir / "promoted").write_text(info["version"] + "\n")
    else:
        (model_dir / "promoted").unlink(missing_ok=True)
    _write_card(model_dir, report)
    return report


def _write_card(model_dir: Path, report: dict):
    def cell(m):
        return f"{m['value']:.4f} ({m['ci95'][0]:.4f} to {m['ci95'][1]:.4f})"
    lines = [f"# Volatility model card: {model_dir.name}", "", f"Serving: {report['gate']['serving']}", ""]
    lines += [f"- {x}" for x in report["gate"]["reasons"]]
    for p, r in report["periods"].items():
        lines += ["", f"## {p.capitalize()} period ({r['days']} days, {r['rows']} rows)",
                  "| forecaster | QLIKE | MAE of log range |", "| --- | --- | --- |"]
        lines += [f"| {n} | {cell(r[n]['qlike'])} | {cell(r[n]['mae_log_range'])} |" for n in ("model", "har_rv", "naive_last_hour")]
        lines.append(f"\nUpper band coverage (target 90%): {cell(r['model']['coverage'])}")
    lines += ["", "Values show the estimate with a 95% bootstrap interval over days. Size of move, not direction; not investment advice."]
    (model_dir / "model-card-vol.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
