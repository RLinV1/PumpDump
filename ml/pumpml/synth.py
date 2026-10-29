"""Synthetic fixture data. Shapes match the real dataset (data/labels/, issue #34) but values are made up:
a model trained on this proves the code works, nothing about real pumps."""
import numpy as np
import pandas as pd

# kind -> (episodes, return, volumeRatio, catalyst filings, label)
KINDS = {
    "pump": (60, 0.12, 8.0, 0.1, 1),
    "news": (40, 0.10, 7.0, 2.0, 0),
    "hype": (40, 0.05, 3.0, 0.1, 0),
    "control": (80, 0.01, 1.0, 0.2, 0),
}
WINDOWS = 6


def make_pump_dataset(seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    kinds = [k for k, v in KINDS.items() for _ in range(v[0])]
    rng.shuffle(kinds)
    rows = []
    for i, kind in enumerate(kinds):
        _, ret, vr, filings, label = KINDS[kind]
        # two episodes per day, so some days have no pump (needed for the false-flags-per-normal-day metric)
        start = pd.Timestamp("2025-01-02 14:30") + pd.Timedelta(days=i // 2, hours=3 * (i % 2))
        peak = start + pd.Timedelta(minutes=5 * WINDOWS + 10) if label else pd.NaT
        n_cat = rng.poisson(filings)
        for w in range(WINDOWS):
            ramp = (w + 1) / WINDOWS
            r = abs(rng.normal(ret * ramp, ret * 0.4 + 0.005))
            rows.append({
                "episode_id": i, "ticker": f"T{rng.integers(0, 40):02d}", "kind": kind, "label": label,
                "window_end": start + pd.Timedelta(minutes=5 * (w + 1)), "peak_time": peak,
                "return": r, "volume": float(rng.lognormal(np.log(2e5 * vr * ramp + 1e3), 0.6)),
                "volumeRatio": abs(rng.normal(vr * ramp, vr * 0.3 + 0.2)),
                "volatility": abs(rng.normal(r * 0.4, 0.01)),
                "filings24h": n_cat, "newsOutlets6h": rng.poisson(filings / 2), "catalystPrecededMove": int(n_cat > 0),
            })
    return pd.DataFrame(rows)


def load_csv(path: str) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["window_end", "peak_time"])
