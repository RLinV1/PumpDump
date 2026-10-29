"""Volatility data and baselines (add-volatility-forecasting section 1): next-60-minute range targets,
HAR-RV and naive last-hour baselines, time-based train / validation / test split.

Bars CSV columns: ticker, timestamp, open, high, low, close, volume (one-minute bars). Free source: Alpaca
historical bars on the free IEX feed (see docs/data-sources.md). Nothing is downloaded here.
shortcut: minutes are treated as consecutive, with no market-hours or gap handling; add it when real bars arrive."""
import json

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
