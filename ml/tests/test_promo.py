import json
import zlib

import numpy as np
import pandas as pd

from pumpml import promo

ANN = ["The coin to pump is {c} on Bittrex target 400 percent", "Coin announced: {c}. Buy now, exchange Yobit, hold for 1h"]
CHAT = ["good morning everyone {c}", "thanks for the signal yesterday {c}", "15 minutes left, get ready {c}", "who is online {c}"]


def fake_embed(texts):
    """Hashed bag of words, deterministic; stands in for the sentence model so tests stay offline."""
    out = np.zeros((len(texts), 64))
    for i, t in enumerate(texts):
        for w in t.lower().split():
            out[i, zlib.crc32(w.encode()) % 64] += 1
    return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)


def frame(n=400):
    rng = np.random.default_rng(0)
    rows = []
    for i in range(n):
        pos = rng.random() < 0.25
        t = (ANN if pos else CHAT)[rng.integers(0, 2 if pos else 4)].format(c=f"coin{i}")
        rows.append({"date": pd.Timestamp("2020-01-01") + pd.Timedelta(hours=i), "text": t, "y": int(pos)})
    return pd.DataFrame(rows)


def test_flatten_joins_entity_lists():
    assert promo.flatten("['a ', {'type': 'link', 'text': 'b'}, ' c']") == "a b c"
    assert promo.flatten("plain") == "plain" and promo.flatten(float("nan")) == ""


def test_load_corpus_drops_dupes_and_empty(tmp_path):
    pd.DataFrame({"date": ["2020-01-02T00:00:00", "2020-01-01T00:00:00", "2020-01-03T00:00:00"],
                  "text": ["dup", "dup", None], "Pump": [np.nan, 1.0, np.nan]}).to_csv(tmp_path / "r.csv", index=False)
    df = promo.load_corpus(tmp_path)
    assert len(df) == 1 and df.iloc[0]["y"] == 1  # earliest copy kept


def test_split_is_chronological_and_fit_learns():
    df = frame()
    tr, va, te = promo.time_split(df)
    assert tr["date"].max() < va["date"].min() <= va["date"].max() < te["date"].min()
    _, info = promo.fit(df, fake_embed)
    m = info["metrics"]
    assert m["precision"]["value"] > 0.9 and m["recall"]["value"] > 0.9
    assert m["recall"]["ci95"][0] <= m["recall"]["value"] <= m["recall"]["ci95"][1]


def test_train_writes_card_with_licenses_and_no_raw_text(tmp_path):
    d = tmp_path / "chat"
    d.mkdir()
    df = frame()
    out = df.assign(date=df["date"].dt.strftime("%Y-%m-%dT%H:%M:%S"), Pump=df["y"].map({1: 1.0, 0: np.nan}))
    out[["date", "text", "Pump"]].to_csv(d / "r.csv", index=False)
    promo.train(d, tmp_path / "out", "t", embed=fake_embed)
    mdir = tmp_path / "out" / "promo-t"
    card = (mdir / "model-card.md").read_text(encoding="utf-8")
    lic = card.split("## Licenses")[1]
    assert "- model promo-t: MIT" in lic
    assert "- embedding model all-MiniLM-L6-v2: Apache-2.0" in lic
    assert "- dataset PumpSense Telegram corpus: MIT" in lic
    assert "coin0" not in card and "coin0" not in (mdir / "model.json").read_text(encoding="utf-8")
    s = promo.score(mdir / "model.json", ["The coin to pump is X on Bittrex", "good morning everyone"], fake_embed)
    assert s[0] > s[1]
