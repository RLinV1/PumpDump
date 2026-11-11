"""Volatility data and baselines (add-volatility-forecasting section 1): next-60-minute range targets,
HAR-RV and naive last-hour baselines, time-based train / validation / test split.

Bars CSV columns: ticker, timestamp, open, high, low, close, volume (one-minute bars). Free source: Alpaca
historical bars on the free IEX feed (see docs/data/sources.md). Nothing is downloaded here.
shortcut: minutes are treated as consecutive, with no market-hours or gap handling; add it when real bars arrive."""
import datetime
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

HORIZON = 60
STEP = 15  # sample every 15 minutes: overlapping hourly targets add rows, not information
DAY = 390  # one US trading day of minutes


def synth_bars(tickers=("AAA", "BBB", "CCC"), days: int = 14, seed: int = 0) -> pd.DataFrame:
    """Fixture bars with volatility clustering (AR(1) log-volatility), so HAR has something to find."""
    rng = np.random.default_rng(seed)
    out = []
    for t in tickers:
        n = days * DAY
        lv = np.zeros(n)
        for i in range(1, n):
            lv[i] = 0.995 * lv[i - 1] + 0.1 * rng.normal()
        vol = 0.0005 * np.exp(lv)
        close = 10 * np.exp(np.cumsum(vol * rng.normal(size=n)))
        hi = close * (1 + vol * np.abs(rng.normal(size=n)))
        lo = close * (1 - vol * np.abs(rng.normal(size=n)))
        out.append(pd.DataFrame({
            "ticker": t, "timestamp": pd.date_range("2025-03-03 09:30", periods=n, freq="min"),
            "open": close, "high": hi, "low": lo, "close": close, "volume": 1000.0}))
    return pd.concat(out, ignore_index=True)


def load_bars(path: str, watchlist: list[str] | None = None) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["timestamp"])
    return df[df["ticker"].isin(watchlist)] if watchlist else df


def _gap(b: pd.DataFrame) -> pd.Series:
    """Log of today's first open over the previous day's last close; 0 on the first day (no previous close)."""
    day = b["timestamp"].dt.date
    first_open = b["open"].groupby(day).transform("first")
    prev_close = b["close"].groupby(day).last().shift(1)
    return np.log(first_open / day.map(prev_close).astype(float)).fillna(0.0)


def build(bars: pd.DataFrame) -> pd.DataFrame:
    """One row per (ticker, sampled minute): HAR terms, naive last-hour range, and the target."""
    parts = []
    for t, b in bars.sort_values("timestamp").groupby("ticker"):
        b = b.reset_index(drop=True)
        r2 = np.log(b["close"]).diff() ** 2
        fwd_hi = b["high"][::-1].rolling(HORIZON).max()[::-1].shift(-1)  # max over the next 60 bars
        fwd_lo = b["low"][::-1].rolling(HORIZON).min()[::-1].shift(-1)
        f = pd.DataFrame({
            "ticker": t, "timestamp": b["timestamp"],
            "rv5": np.sqrt(r2.rolling(5).sum()), "rv30": np.sqrt(r2.rolling(30).sum()),
            "rvd": np.sqrt(r2.rolling(DAY).sum()),
            "vol_ratio": b["volume"].rolling(30).mean() / b["volume"].rolling(DAY).mean(),
            "tod": b["timestamp"].dt.hour * 60 + b["timestamp"].dt.minute,
            "gap": _gap(b),
            "naive": np.log(b["high"].rolling(HORIZON).max() / b["low"].rolling(HORIZON).min()),
            "target": np.log(fwd_hi / fwd_lo),
        })
        parts.append(f.iloc[::STEP])
    return pd.concat(parts, ignore_index=True).dropna().sort_values("timestamp").reset_index(drop=True)


def split(d: pd.DataFrame, fracs=(0.6, 0.8)):
    """Time-based train / validation / test. A 60-minute gap at each cut keeps targets from overlapping."""
    ts = d["timestamp"]
    cuts = [ts.min() + (ts.max() - ts.min()) * f for f in fracs]
    gap = pd.Timedelta(minutes=HORIZON)
    return (d[ts < cuts[0] - gap], d[(ts >= cuts[0]) & (ts < cuts[1] - gap)], d[ts >= cuts[1]])


class HarRV:
    """OLS of the next-hour range on the 5-minute, 30-minute and one-day realized volatility."""
    COLS = ["rv5", "rv30", "rvd"]

    def fit(self, d: pd.DataFrame):
        X = np.column_stack([np.ones(len(d)), d[self.COLS]])
        self.coef, *_ = np.linalg.lstsq(X, d["target"], rcond=None)
        return self

    def predict(self, d: pd.DataFrame) -> np.ndarray:
        return np.maximum(np.column_stack([np.ones(len(d)), d[self.COLS]]) @ self.coef, 1e-6)


def qlike(forecast, target) -> float:
    """QLIKE on squared range as the variance proxy (lower is better)."""
    ratio = (np.asarray(target) / np.asarray(forecast)) ** 2
    return float(np.mean(ratio - np.log(ratio) - 1))


def mae(forecast, target) -> float:
    return float(np.mean(np.abs(np.asarray(forecast) - np.asarray(target))))


def baseline_report(bars: pd.DataFrame) -> dict:
    d = build(bars)
    tr, va, te = split(d)
    har = HarRV().fit(tr)
    report = {"rows": {"train": len(tr), "validation": len(va), "test": len(te)}, "har_coef": har.coef.tolist()}
    for name, part in (("validation", va), ("test", te)):
        for model, fc in (("har_rv", har.predict(part)), ("naive_last_hour", np.maximum(part["naive"], 1e-6))):
            report.setdefault(model, {})[name] = {"qlike": qlike(fc, part["target"]), "mae_log_range": mae(fc, part["target"])}
    return report


def run(bars: pd.DataFrame, out: str | None = None) -> dict:
    rep = baseline_report(bars)
    if out:
        with open(out, "w") as f:
            json.dump(rep, f, indent=2)
    return rep


# Model features (task 2.1). Not trainable from free historical bars, so version 1 leaves them out, like the pump
# model's version 1: spread (bars carry no quotes), pump score, chatter ratio, new-account share (no free social
# history), and the filing/news flag (no historical archive). Add them when that history exists.
FEATURES = ["rv5", "rv30", "rvd", "vol_ratio", "tod", "gap"]
QUANTILES = {"median": 0.5, "upper": 0.9}
COVERAGE = 0.9


def _fit_q(d: pd.DataFrame, alpha: float) -> lgb.Booster:
    m = lgb.LGBMRegressor(objective="quantile", alpha=alpha, n_estimators=200, learning_rate=0.05, num_leaves=8,
                          min_child_samples=20, random_state=0, deterministic=True, force_row_wise=True,
                          n_jobs=1, verbose=-1)
    return m.fit(d[FEATURES], d["target"]).booster_


def predict_band(median_b, upper_b, shift: float, d: pd.DataFrame):
    """Median and corrected upper band; the band is never below the median."""
    med = median_b.predict(d[FEATURES])
    return med, np.maximum(np.maximum(upper_b.predict(d[FEATURES]), med) + shift, med)


def fit_shift(median_b, upper_b, d: pd.DataFrame, level: float = COVERAGE) -> float:
    """Log-space shift so `level` of the targets in d fall under the band. Call with the validation split only."""
    _, up = predict_band(median_b, upper_b, 0.0, d)
    resid = np.sort(d["target"].to_numpy() - up)
    k = min(int(np.ceil((len(resid) + 1) * level)), len(resid)) - 1  # split-conformal quantile
    return float(resid[k])


def coverage(target, upper) -> float:
    return float(np.mean(np.asarray(target) <= np.asarray(upper)))


def train(bars: pd.DataFrame, out_dir: Path, version: str = "dev") -> dict:
    """Fit both quantile models on train, fit the coverage shift on validation, write artifacts. Test is untouched."""
    tr, va, te = split(build(bars))
    if min(len(tr), len(va), len(te)) == 0:
        raise SystemExit("not enough bars for a train / validation / test split")
    med_b, up_b = (_fit_q(tr, a) for a in QUANTILES.values())
    shift = fit_shift(med_b, up_b, va)
    har = HarRV().fit(tr)  # the JVM fallback when the ONNX models cannot be served
    har_resid = np.sort(va["target"].to_numpy() - har.predict(va))  # both in log-range units
    har_shift = float(har_resid[min(int(np.ceil((len(har_resid) + 1) * COVERAGE)), len(har_resid)) - 1])
    out_dir.mkdir(parents=True, exist_ok=True)
    med_b.save_model(str(out_dir / "median.txt"))
    up_b.save_model(str(out_dir / "upper.txt"))
    info = {"format": 2, "version": version, "features": FEATURES, "quantiles": QUANTILES, "target": "log(high/low) over next 60 min",
            "coverage_shift": shift, "coverage_level": COVERAGE,
            "har_coef": har.coef.tolist(), "har_band_shift": har_shift,  # [intercept, rv5, rv30, rvd]; band = max(har + shift, har), same units as the boosters
            "validation_coverage_raw": coverage(va["target"], predict_band(med_b, up_b, 0.0, va)[1]),
            "validation_coverage_corrected": coverage(va["target"], predict_band(med_b, up_b, shift, va)[1]),
            "rows": {"train": len(tr), "validation": len(va), "test": len(te)},
            "trained_on": datetime.date.today().isoformat()}
    (out_dir / "model.json").write_text(json.dumps(info, indent=2))
    export_onnx(med_b, up_b, shift, va, out_dir)
    return info


def export_onnx(median_b, upper_b, shift: float, sample: pd.DataFrame, out_dir: Path) -> None:
    """median.onnx and upper.onnx = the raw boosters (log range). The corrected band, max(max(upper, median) + shift,
    median), is applied in the JVM from model.json, like the pump model's calibration. reference.json = one input and
    the expected log-space median and corrected upper band for the startup self-check."""
    from onnxmltools import convert_lightgbm
    from onnxmltools.convert.common.data_types import FloatTensorType

    for name, b in (("median", median_b), ("upper", upper_b)):
        m = convert_lightgbm(b, initial_types=[("input", FloatTensorType([None, len(FEATURES)]))], target_opset=15)
        (out_dir / f"{name}.onnx").write_bytes(m.SerializeToString())
    row = sample.iloc[[len(sample) // 2]]
    med, up = predict_band(median_b, upper_b, shift, row)
    ref = {"features": {f: float(row[f].iloc[0]) for f in FEATURES},
           "expected_median": float(med[0]), "expected_upper": float(up[0])}
    (out_dir / "reference.json").write_text(json.dumps(ref, indent=2))
