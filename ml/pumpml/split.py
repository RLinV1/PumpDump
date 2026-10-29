"""Time-based splits that keep every window of one episode on the same side."""
import pandas as pd


def _take(df: pd.DataFrame, start_ge=None, end_lt=None) -> pd.DataFrame:
    ep = df.groupby("episode_id")["window_end"].agg(["min", "max"])
    ok = pd.Series(True, index=ep.index)
    if start_ge is not None:
        ok &= ep["min"] >= start_ge
    if end_lt is not None:
        ok &= ep["max"] < end_lt
    return df[df["episode_id"].isin(ep.index[ok])]


def _cuts(df: pd.DataFrame, fracs):
    starts = df.groupby("episode_id")["window_end"].min().sort_values().reset_index(drop=True)
    return [starts.iloc[min(int(f * len(starts)), len(starts) - 1)] for f in fracs]


def three_way(df: pd.DataFrame, fracs=(0.6, 0.8)):
    """train / calibration / test. Episodes straddling a cut are dropped, so train ends before test begins."""
    t1, t2 = _cuts(df, fracs)
    return _take(df, end_lt=t1), _take(df, start_ge=t1, end_lt=t2), _take(df, start_ge=t2)


def time_folds(df: pd.DataFrame, k: int = 3):
    """Expanding-window folds: train on the past, validate on the next chunk."""
    cuts = _cuts(df, [(i + 1) / (k + 1) for i in range(k)]) + [None]
    for i in range(k):
        yield _take(df, end_lt=cuts[i]), _take(df, start_ge=cuts[i], end_lt=cuts[i + 1])
