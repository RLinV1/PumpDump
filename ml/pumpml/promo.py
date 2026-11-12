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
# Zenodo record 19616802 (v1.1, open access) states "MIT License" with no extra terms, checked 2026-11-11.
DATASET_LICENSE = "MIT"
# Declared licenses of the embedding stack.
DEPS = {"sentence-transformers": "Apache-2.0", "transformers": "Apache-2.0", "torch": "BSD-3-Clause",
        "scikit-learn": "BSD-3-Clause", "pandas": "BSD-3-Clause", "numpy": "BSD-3-Clause"}
LIMITS = [
    "Positives are pump-announcement messages in crypto Telegram groups; negatives are the other messages in those groups, "
    "including countdown hype. The model separates 'announces the coin' from 'other group chatter', not promotion from normal speech.",
    "It has not been tested on stock posts (Reddit, Bluesky, StockTwits). Expect a domain shift; check before using it as a feature.",
    "Metrics are on a later period of the same groups. Resampling is over messages, which come in bursts, so the intervals are optimistic.",
    "Exact duplicate texts were removed before splitting, so templated announcements that repeat verbatim are counted once.",
    "Labels are noisy in both directions: some unlabelled messages are real announcements, and some 'pump postponed' notices are labelled positive.",
    "The corpus is public Telegram channel posts. MIT is the archive's only stated license; it does not address Telegram's own terms.",
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


def _device(device=None):
    import torch
    if device:
        return device
    if not torch.cuda.is_available():
        raise SystemExit("--finetune needs a CUDA GPU and torch.cuda.is_available() is false; refusing to fall back to CPU.")
    return "cuda"


class _Net:
    """Encoder + linear head on mean-pooled tokens (what sentence-transformers does for MiniLM, minus the normalisation)."""

    def __init__(self, enc, head):
        self.enc, self.head = enc, head

    def logits(self, batch):
        h = self.enc(**batch).last_hidden_state
        m = batch["attention_mask"].unsqueeze(-1).to(h.dtype)
        return self.head((h * m).sum(1) / m.sum(1).clamp(min=1)).squeeze(-1)


def _predict(net, tok, texts, device, max_len, bs=256) -> np.ndarray:
    import torch
    texts = list(texts)
    order = np.argsort([len(t) for t in texts])  # similar lengths per batch -> less padding
    out = np.zeros(len(texts))
    net.enc.eval()
    with torch.no_grad(), torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
        for i in range(0, len(texts), bs):
            idx = order[i:i + bs]
            b = tok([texts[j] for j in idx], truncation=True, max_length=max_len, padding=True, return_tensors="pt").to(device)
            out[idx] = torch.sigmoid(net.logits(b).float()).cpu().numpy()
    return out


def _load_net(enc_dir, coef, intercept, device):
    import torch
    from transformers import AutoModel
    enc = AutoModel.from_pretrained(enc_dir).to(device)
    head = torch.nn.Linear(enc.config.hidden_size, 1).to(device)
    with torch.no_grad():
        head.weight.copy_(torch.tensor(coef).unsqueeze(0))
        head.bias.fill_(intercept)
    return _Net(enc, head)


def fit_finetune(df: pd.DataFrame, out: Path, base=EMBED_MODEL, device=None, epochs=3, batch=64, lr=2e-5,
                 max_len=128, neg_per_pos=20, seed=0):
    """Fine-tune the encoder + linear head. Imbalance: every epoch uses all train positives and a fresh random sample of
    neg_per_pos negatives per positive (plain BCE). Keeps the epoch with the best validation PR-AUC, picks the threshold
    on validation only, saves encoder/tokenizer under out/encoder, scores the test period from the saved weights."""
    import torch
    from transformers import AutoModel, AutoTokenizer
    device = _device(device)
    tr, va, te = time_split(df)
    for name, part in (("train", tr), ("validation", va), ("test", te)):
        if part["y"].nunique() < 2:
            raise SystemExit(f"{name} period has one class; need more data")
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    tok = AutoTokenizer.from_pretrained(base)
    enc = AutoModel.from_pretrained(base).to(device)
    net = _Net(enc, torch.nn.Linear(enc.config.hidden_size, 1).to(device))
    opt = torch.optim.AdamW(list(enc.parameters()) + list(net.head.parameters()), lr=lr)
    scaler = torch.amp.GradScaler(enabled=device == "cuda")
    pos, neg = np.flatnonzero(tr["y"].to_numpy() == 1), np.flatnonzero(tr["y"].to_numpy() == 0)
    X, y = tr["text"].to_numpy(), tr["y"].to_numpy(dtype="float32")
    best, hist = None, []
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    for ep in range(1, epochs + 1):
        enc.train()
        idx = rng.permutation(np.concatenate([pos, rng.choice(neg, min(len(neg), neg_per_pos * len(pos)), replace=False)]))
        for i in range(0, len(idx), batch):
            j = idx[i:i + batch]
            b = tok(list(X[j]), truncation=True, max_length=max_len, padding=True, return_tensors="pt").to(device)
            with torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
                loss = torch.nn.functional.binary_cross_entropy_with_logits(net.logits(b).float(), torch.tensor(y[j], device=device))
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
        pv = _predict(net, tok, va["text"], device, max_len)
        ap = float(average_precision_score(va["y"], pv))
        hist.append(ap)
        if best is None or ap > best[0]:
            best = (ap, ep, pv)
            out.mkdir(parents=True, exist_ok=True)
            enc.save_pretrained(out / "encoder")
            tok.save_pretrained(out / "encoder")
            head = {"coef": net.head.weight.detach().float().cpu().numpy()[0].tolist(), "intercept": float(net.head.bias.item())}
    pr, rc, th = precision_recall_curve(va["y"], best[2])
    f1 = 2 * pr[:-1] * rc[:-1] / np.maximum(pr[:-1] + rc[:-1], 1e-12)
    thr = float(th[int(np.argmax(f1))])  # F1-optimal on validation only
    peak = torch.cuda.max_memory_allocated() / 2**20 if device == "cuda" else 0.0
    net = _load_net(out / "encoder", head["coef"], head["intercept"], device)
    metrics = bootstrap(te["y"].to_numpy(), _predict(net, tok, te["text"], device, max_len), thr)
    parts = {"train": tr, "validation": va, "test": te}
    return {"epoch": best[1], "val_pr_auc_by_epoch": hist, "epochs": epochs, "lr": lr, "batch": batch, "max_len": max_len,
            "neg_per_pos": neg_per_pos, "threshold": thr, "metrics": metrics, "peak_gpu_mb": peak, **head,
            "sizes": {k: len(p) for k, p in parts.items()},
            "positives": {k: int(p["y"].sum()) for k, p in parts.items()},
            "periods": {k: [str(p["date"].min().date()), str(p["date"].max().date())] for k, p in parts.items()}}


def _tfidf_matrix(vocab, idf, texts):
    """Rebuild TfidfVectorizer(1-2 grams, sublinear_tf) from saved vocabulary and idf, so no pickle is needed."""
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.preprocessing import normalize
    X = CountVectorizer(ngram_range=(1, 2), vocabulary=vocab).transform(texts).astype(float)
    X.data = 1 + np.log(X.data)
    return normalize(X.multiply(np.asarray(idf)).tocsr())


def fit_tfidf(df: pd.DataFrame, cs=(0.1, 1, 10, 100)):
    """TF-IDF word 1-2 grams (fit on train only) + logistic regression; C and threshold chosen on validation only."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    tr, va, te = time_split(df)
    for name, part in (("train", tr), ("validation", va), ("test", te)):
        if part["y"].nunique() < 2:
            raise SystemExit(f"{name} period has one class; need more data")
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2)
    X = {"tr": vec.fit_transform(tr["text"]), "va": vec.transform(va["text"]), "te": vec.transform(te["text"])}
    fits = [(c, LogisticRegression(C=c, class_weight="balanced", max_iter=2000, solver="liblinear").fit(X["tr"], tr["y"])) for c in cs]
    c, model = max(fits, key=lambda t: average_precision_score(va["y"], t[1].predict_proba(X["va"])[:, 1]))
    pr, rc, th = precision_recall_curve(va["y"], model.predict_proba(X["va"])[:, 1])
    f1 = 2 * pr[:-1] * rc[:-1] / np.maximum(pr[:-1] + rc[:-1], 1e-12)
    thr = float(th[int(np.argmax(f1))])
    parts = {"train": tr, "validation": va, "test": te}
    info = {"kind": "tfidf", "C": c, "threshold": thr,
            "metrics": bootstrap(te["y"].to_numpy(), model.predict_proba(X["te"])[:, 1], thr),
            "coef": model.coef_[0].tolist(), "intercept": float(model.intercept_[0]),
            "vocabulary": {k: int(v) for k, v in vec.vocabulary_.items()}, "idf": vec.idf_.tolist(),
            "sizes": {k: len(p) for k, p in parts.items()},
            "positives": {k: int(p["y"].sum()) for k, p in parts.items()},
            "periods": {k: [str(p["date"].min().date()), str(p["date"].max().date())] for k, p in parts.items()}}
    return info


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
        "## Task", "Flags a short social message as a pump announcement. " + (
            f"The encoder {EMBED_MODEL} was fine-tuned end to end with a linear head on mean-pooled tokens."
            if "epoch" in info else "Logistic regression on TF-IDF word 1-2 grams; no pretrained model is used."
            if info.get("kind") == "tfidf" else f"Logistic regression on sentence embeddings; embeddings come from {EMBED_MODEL}."), "",
        "## Data", f"- {DATASET}; raw text is not stored or committed.",
        *[f"- {k}: {s[k]} messages ({pos[k]} pump announcements), {per[k][0]} to {per[k][1]}" for k in s],
        (f"- Fine-tuning: up to {info['epochs']} epochs, lr {info['lr']}, batch {info['batch']}, max length {info['max_len']}, "
         f"{info['neg_per_pos']} sampled negatives per positive each epoch; epoch {info['epoch']} kept (best validation PR-AUC), "
         if "epoch" in info else f"- Regularisation C={info['C']}, ") + f"threshold {info['threshold']:.3f} chosen on the validation period only.",
        *(["- The fine-tuned weights derive from all-MiniLM-L6-v2 and keep its Apache-2.0 terms."] if "epoch" in info else []), "",
        "## Metrics on the held-out test period (later in time than training)",
        "| precision | recall | PR-AUC |", "| --- | --- | --- |", f"| {cell('precision')} | {cell('recall')} | {cell('pr_auc')} |", "",
        "Values show the estimate with a 95% bootstrap interval over messages.", "",
        "## Known limits", *[f"- {x}" for x in LIMITS],
        *(["- The saved vocabulary holds word n-grams from the corpus (min_df=2), not whole messages. The model keys on crypto "
           "exchange words, so it will likely transfer worse to stock posts."] if info.get("kind") == "tfidf" else []), "",
        "## Licenses", f"- model {name}: {MODEL_LICENSE}", *([] if info.get("kind") == "tfidf" else [f"- embedding model {EMBED_MODEL.split('/')[-1]}: {EMBED_LICENSE}"]),
        f"- dataset PumpSense Telegram corpus: {DATASET_LICENSE}",
        *[f"- {n} {_ver(n)}: {lic}" for n, lic in DEPS.items()],
    ]
    p = out / "model-card.md"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def train(data_dir: Path, out_dir: Path, version_name: str, embed=embed_texts, finetune=False, tfidf=False, **ft) -> dict:
    df = load_corpus(data_dir)
    out = Path(out_dir) / f"promo-{version_name}"
    out.mkdir(parents=True, exist_ok=True)
    if tfidf:
        info = fit_tfidf(df)
        meta = {k: info[k] for k in ("kind", "vocabulary", "idf", "coef", "intercept")}
    elif finetune:
        info = fit_finetune(df, out, **ft)
        meta = {"kind": "finetuned", "embedding_model": EMBED_MODEL, "encoder": "encoder", "max_length": info["max_len"],
                "coef": info["coef"], "intercept": info["intercept"]}
    else:
        model, info = fit(df, embed)
        meta = {"embedding_model": EMBED_MODEL, "coef": model.coef_[0].tolist(), "intercept": float(model.intercept_[0])}
    (out / "model.json").write_text(json.dumps({**meta, "threshold": info["threshold"], "license": MODEL_LICENSE}), encoding="utf-8")
    write_card(out, out.name, info)
    return info


def score(model_json: Path, texts, embed=embed_texts, device=None) -> np.ndarray:
    """Probability each text is a pump announcement, from a saved model.json (frozen or fine-tuned)."""
    m = json.loads(Path(model_json).read_text(encoding="utf-8"))
    if m.get("kind") == "tfidf":
        z = _tfidf_matrix(m["vocabulary"], m["idf"], list(texts)) @ np.array(m["coef"]) + m["intercept"]
        return 1 / (1 + np.exp(-z))
    if m.get("kind") == "finetuned":
        from transformers import AutoTokenizer
        d, enc_dir = _device(device), Path(model_json).parent / m["encoder"]
        return _predict(_load_net(enc_dir, m["coef"], m["intercept"], d), AutoTokenizer.from_pretrained(enc_dir), texts, d, m["max_length"])
    z = embed(texts) @ np.array(m["coef"]) + m["intercept"]
    return 1 / (1 + np.exp(-z))
