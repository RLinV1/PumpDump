"""Promotional-language classifier: logistic regression on sentence embeddings (design.md, "Text signals").

Trains on the PumpSense Telegram corpus (MIT, Zenodo 10.5281/zenodo.19616802): label 1 = a pump-announcement
message, 0 = every other message in the same pump-organising groups (countdowns, chatter, results). It learns
pump-announcement language in crypto groups, not equity promotion in general; see LIMITS.

Raw text is read, embedded and dropped. Only the 384 coefficients, the metrics and the card are written, under
the gitignored models/ directory. Nothing here stores or prints a message.
"""
import ast
import datetime
import json
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_recall_curve

from .card import MODEL_LICENSE

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_LICENSE = "Apache-2.0"  # model card on Hugging Face, checked 2026-11-11
DATASET = "PumpSense Telegram pump-and-dump corpus (Zenodo 10.5281/zenodo.19616802)"
DATASET_LICENSE = "MIT"  # https://github.com/AhmedMahrous00/icbc_2026_reproducibility/blob/main/LICENSE
# Declared licenses of the embedding stack.
DEPS = {"sentence-transformers": "Apache-2.0", "transformers": "Apache-2.0", "torch": "BSD-3-Clause",
        "scikit-learn": "BSD-3-Clause", "pandas": "BSD-3-Clause", "numpy": "BSD-3-Clause"}
LIMITS = [
    "Positives are pump-announcement messages in crypto Telegram groups; negatives are the other messages in those groups, "
    "including countdown hype. The model separates 'announces the coin' from 'other group chatter', not promotion from normal speech.",
    "It has not been tested on stock posts (Reddit, Bluesky, StockTwits). Expect a domain shift; check before using it as a feature.",
    "Metrics are on a later period of the same groups. Resampling is over messages, which come in bursts, so the intervals are optimistic.",
    "Exact duplicate texts were removed before splitting, so templated announcements that repeat verbatim are counted once.",
]


def flatten(raw) -> str:
    """The corpus stores some texts as a printed list of strings and entity dicts; join them back into one string."""
    if not isinstance(raw, str):
        return ""
    s = raw.strip()
    if s.startswith("["):
        try:
            parts = ast.literal_eval(s)
            return "".join(p if isinstance(p, str) else p.get("text", "") for p in parts).strip()
        except (ValueError, SyntaxError, AttributeError):
            pass
    return s


def load_corpus(root: Path) -> pd.DataFrame:
    """All `*.csv` (columns date, text, Pump) under root -> frame with date, text, y. Drops empty and duplicate texts."""
    frames = [pd.read_csv(f, usecols=["date", "text", "Pump"]) for f in sorted(Path(root).rglob("*.csv"))]
    if not frames:
        raise SystemExit(f"no CSV files under {root}")
    df = pd.concat(frames, ignore_index=True)
    df["text"] = df["text"].map(flatten)
    df["y"] = (df["Pump"] == 1).astype(int)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df[(df["text"] != "") & df["date"].notna()].sort_values("date", kind="stable")
    df = df.drop_duplicates(subset="text", keep="first")  # first occurrence keeps the earlier period; no train/test text overlap
    return df[["date", "text", "y"]].reset_index(drop=True)


def time_split(df: pd.DataFrame, fracs=(0.6, 0.8)):
    """Chronological train / validation / test. df must be sorted by date."""
    a, b = (int(f * len(df)) for f in fracs)
    return df.iloc[:a], df.iloc[a:b], df.iloc[b:]


def embed_texts(texts, batch_size=128) -> np.ndarray:
    from sentence_transformers import SentenceTransformer  # optional dependency, only needed to train or score
    m = SentenceTransformer(EMBED_MODEL)
    return m.encode(list(texts), batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False)


def _prf(y, pred):
    tp = int(((pred == 1) & (y == 1)).sum())
    return tp / max(int((pred == 1).sum()), 1), tp / max(int((y == 1).sum()), 1)


def bootstrap(y, score, thr, n=1000, seed=0) -> dict:
    """Precision, recall and PR-AUC at thr with 95% percentile intervals from resampling messages."""
    rng = np.random.default_rng(seed)
    out = {"precision": [], "recall": [], "pr_auc": []}
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].sum() == 0:
            continue
        p, r = _prf(y[i], (score[i] >= thr).astype(int))
        out["precision"].append(p), out["recall"].append(r), out["pr_auc"].append(average_precision_score(y[i], score[i]))
    p, r = _prf(y, (score >= thr).astype(int))
    pt = {"precision": p, "recall": r, "pr_auc": average_precision_score(y, score)}
    return {k: {"value": pt[k], "ci95": [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]} for k, v in out.items()}


def fit(df: pd.DataFrame, embed=embed_texts, cs=(0.1, 1.0, 10.0)):
    """Fit on the early period, pick C and the decision threshold on the middle period, score the late period."""
    tr, va, te = time_split(df)
    for name, part in (("train", tr), ("validation", va), ("test", te)):
        if part["y"].nunique() < 2:
            raise SystemExit(f"{name} period has one class; need more data")
    X = {k: embed(p["text"]) for k, p in (("tr", tr), ("va", va), ("te", te))}
    fits = [(c, LogisticRegression(C=c, class_weight="balanced", max_iter=2000).fit(X["tr"], tr["y"])) for c in cs]
    c, model = max(fits, key=lambda t: average_precision_score(va["y"], t[1].predict_proba(X["va"])[:, 1]))
    pr, rc, th = precision_recall_curve(va["y"], model.predict_proba(X["va"])[:, 1])
    f1 = 2 * pr[:-1] * rc[:-1] / np.maximum(pr[:-1] + rc[:-1], 1e-12)
    thr = float(th[int(np.argmax(f1))])  # F1-optimal on validation only; test is not used to choose anything
    metrics = bootstrap(te["y"].to_numpy(), model.predict_proba(X["te"])[:, 1], thr)
    parts = {"train": tr, "validation": va, "test": te}
    info = {"C": c, "threshold": thr, "metrics": metrics,
            "sizes": {k: len(p) for k, p in parts.items()},
            "positives": {k: int(p["y"].sum()) for k, p in parts.items()},
            "periods": {k: [str(p["date"].min().date()), str(p["date"].max().date())] for k, p in parts.items()}}
    return model, info


def _ver(n):
    try:
        return version(n)
    except PackageNotFoundError:
        return "not installed"


def write_card(out: Path, name: str, info: dict) -> Path:
    m = info["metrics"]
    cell = lambda k: f"{m[k]['value']:.3f} ({m[k]['ci95'][0]:.3f} to {m[k]['ci95'][1]:.3f})"
    s, pos, per = info["sizes"], info["positives"], info["periods"]
    lines = [
        f"# Model card: {name}", "", f"Date: {datetime.date.today().isoformat()}", "",
        "## Task", "Flags a short social message as a pump announcement. Logistic regression on sentence embeddings; "
        f"embeddings come from {EMBED_MODEL}.", "",
        "## Data", f"- {DATASET}; raw text is not stored or committed.",
        *[f"- {k}: {s[k]} messages ({pos[k]} pump announcements), {per[k][0]} to {per[k][1]}" for k in s],
        f"- Regularisation C={info['C']} and threshold {info['threshold']:.3f} chosen on the validation period only.", "",
        "## Metrics on the held-out test period (later in time than training)",
        "| precision | recall | PR-AUC |", "| --- | --- | --- |", f"| {cell('precision')} | {cell('recall')} | {cell('pr_auc')} |", "",
        "Values show the estimate with a 95% bootstrap interval over messages.", "",
        "## Known limits", *[f"- {x}" for x in LIMITS], "",
        "## Licenses", f"- model {name}: {MODEL_LICENSE}", f"- embedding model {EMBED_MODEL.split('/')[-1]}: {EMBED_LICENSE}",
        f"- dataset PumpSense Telegram corpus: {DATASET_LICENSE}",
        *[f"- {n} {_ver(n)}: {lic}" for n, lic in DEPS.items()],
    ]
    p = out / "model-card.md"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def train(data_dir: Path, out_dir: Path, version_name: str, embed=embed_texts) -> dict:
    df = load_corpus(data_dir)
    model, info = fit(df, embed)
    out = Path(out_dir) / f"promo-{version_name}"
    out.mkdir(parents=True, exist_ok=True)
    (out / "model.json").write_text(json.dumps({
        "embedding_model": EMBED_MODEL, "coef": model.coef_[0].tolist(), "intercept": float(model.intercept_[0]),
        "threshold": info["threshold"], "license": MODEL_LICENSE}), encoding="utf-8")
    write_card(out, out.name, info)
    return info


def score(model_json: Path, texts, embed=embed_texts) -> np.ndarray:
    """Probability each text is a pump announcement, from a saved model.json."""
    m = json.loads(Path(model_json).read_text(encoding="utf-8"))
    z = embed(texts) @ np.array(m["coef"]) + m["intercept"]
    return 1 / (1 + np.exp(-z))
