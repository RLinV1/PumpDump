import numpy as np
import pandas as pd

from pumpml import vol


def test_target_is_log_range_of_next_60_bars():
    n = 1000
    i = np.arange(n)
    bars = pd.DataFrame({"ticker": "X", "timestamp": pd.date_range("2025-01-01", periods=n, freq="min"),
                         "open": 10.0, "close": 10 + 0.001 * i, "high": 10.0 + i * 0.001, "low": 10.0 - i * 0.001,
                         "volume": 1.0})
    d = vol.build(bars)
    row = d[d["timestamp"] == pd.Timestamp("2025-01-01 07:30")]  # bar 450; the window is bars 451..510
    assert len(row) == 1
    assert np.isclose(row["target"].iloc[0], np.log((10 + 510 * 0.001) / (10 - 510 * 0.001)))


def test_no_lookahead_in_features():
    bars = vol.synth_bars(("AAA",), days=4)
    full = vol.build(bars)
    cut = bars[bars["timestamp"] < bars["timestamp"].iloc[-200]]
    part = vol.build(cut)
    m = part.merge(full, on=["ticker", "timestamp"])
    for c in ("rv5", "rv30", "rvd", "naive"):
        assert np.allclose(m[c + "_x"], m[c + "_y"])


def test_split_is_ordered_with_gap():
    d = vol.build(vol.synth_bars())
    tr, va, te = vol.split(d)
    assert tr["timestamp"].max() + pd.Timedelta(minutes=vol.HORIZON) < va["timestamp"].min()
    assert va["timestamp"].max() + pd.Timedelta(minutes=vol.HORIZON) < te["timestamp"].min()
    assert min(len(tr), len(va), len(te)) > 0


def test_baselines_scored_and_har_beats_naive_on_clustered_vol(tmp_path):
    rep = vol.run(vol.synth_bars(), str(tmp_path / "r.json"))
    for m in ("har_rv", "naive_last_hour"):
        for part in ("validation", "test"):
            assert np.isfinite(rep[m][part]["qlike"]) and np.isfinite(rep[m][part]["mae_log_range"])
    assert (tmp_path / "r.json").exists()
    assert rep["har_rv"]["test"]["mae_log_range"] < rep["naive_last_hour"]["test"]["mae_log_range"]


def test_qlike_zero_for_perfect_forecast():
    assert vol.qlike([0.1, 0.2], [0.1, 0.2]) == 0.0
