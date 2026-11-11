"""Label dataset (data/labels/): validator, report and the minimum-count gate. Metadata only: tickers, dates, URLs, notes."""
import csv
import datetime
import json
from collections import Counter
from pathlib import Path

LABELS_DIR = Path(__file__).resolve().parents[2] / "data" / "labels"
FIELDS = ["id", "ticker", "class", "start", "end", "source_urls", "note", "confidence", "labeled_on"]
CLASSES = ("pump", "news_mover", "hype_no_manipulation", "control")
CONFIDENCE = ("high", "uncertain")
MIN_PER_CLASS = 20  # configured minimum episodes per class before real-label training is allowed
# window CSV `kind` values (pumpml/synth.py) -> label classes
KIND_TO_CLASS = {"pump": "pump", "news": "news_mover", "hype": "hype_no_manipulation", "control": "control"}


def load(path: Path | None = None) -> list[dict]:
    with open(path or LABELS_DIR / "episodes.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _date(s):
    try:
        return datetime.date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def validate(rows: list[dict]) -> list[str]:
    """Return a list of problems; empty means the file is valid."""
    errs, seen, by_ticker = [], set(), {}
    for n, r in enumerate(rows, start=2):  # line 1 is the header
        rid = r.get("id") or f"line {n}"
        for f in FIELDS:
            if f != "source_urls" and not (r.get(f) or "").strip():
                errs.append(f"{rid}: missing {f}")
        if r.get("id") in seen:
            errs.append(f"{rid}: duplicate id")
        seen.add(r.get("id"))
        if r.get("class") not in CLASSES:
            errs.append(f"{rid}: bad class {r.get('class')!r}")
        if r.get("confidence") not in CONFIDENCE:
            errs.append(f"{rid}: bad confidence {r.get('confidence')!r}")
        s, e = _date(r.get("start")), _date(r.get("end"))
        if s is None or e is None:
            errs.append(f"{rid}: invalid start/end date")
        elif e < s:
            errs.append(f"{rid}: end before start")
        if _date(r.get("labeled_on")) is None:
            errs.append(f"{rid}: invalid labeled_on")
        urls = (r.get("source_urls") or "").split()
        if r.get("class") != "control" and not urls:
            errs.append(f"{rid}: non-control row needs a source URL")
        errs += [f"{rid}: source URL must be https: {u}" for u in urls if not u.startswith("https://")]
        if s and e and r.get("class") in CLASSES:
            by_ticker.setdefault(r.get("ticker"), []).append((s, e, r["class"], rid))
    for t, eps in by_ticker.items():
        for i, (s1, e1, c1, id1) in enumerate(eps):
            for s2, e2, c2, id2 in eps[i + 1:]:
                if c1 != c2 and s1 <= e2 and s2 <= e1:
                    errs.append(f"{t}: {id1} ({c1}) overlaps {id2} ({c2})")
    return errs


def report(rows: list[dict]) -> str:
    cls = Counter(r["class"] for r in rows)
    out = ["# Label dataset report", "",
           f"Episodes: {len(rows)}. Minimum per class for real-label training: {MIN_PER_CLASS}.", "",
           "| class | total | high | uncertain |", "| --- | --- | --- | --- |"]
    for c in CLASSES:
        conf = Counter(r["confidence"] for r in rows if r["class"] == c)
        out.append(f"| {c} | {cls[c]} | {conf['high']} | {conf['uncertain']} |")
    out += ["", "## By year of window start", "", "| year | " + " | ".join(CLASSES) + " |", "| --- |" + " --- |" * len(CLASSES)]
    for y in sorted({r["start"][:4] for r in rows}):
        c = Counter(r["class"] for r in rows if r["start"][:4] == y)
        out.append(f"| {y} | " + " | ".join(str(c[k]) for k in CLASSES) + " |")
    return "\n".join(out) + "\n"


def review(rows: list[dict]) -> str:
    out = ["# Rows awaiting owner review", "",
           "Each row is marked `uncertain`. Say keep or drop. The reason is the row's own note.", "",
           "| id | ticker | why uncertain | link |", "| --- | --- | --- | --- |"]
    for r in rows:
        if r["confidence"] == "uncertain":
            out.append(f"| {r['id']} | {r['ticker']} | {r['note'].replace('|', '/')} | {(r['source_urls'].split() or ['none'])[0]} |")
    return "\n".join(out) + "\n"


def gate(counts: dict[str, int], minimum: int = MIN_PER_CLASS) -> None:
    """Refuse to train when any class has fewer than `minimum` episodes. `counts` maps class -> distinct episodes."""
    short = {c: n for c, n in counts.items() if n < minimum}
    if short:
        raise SystemExit("refusing to train on real labels: " + ", ".join(f"{c} has {n} episodes" for c, n in short.items())
                         + f" (minimum is {minimum} per class)")


def gate_windows(df, minimum: int = MIN_PER_CLASS) -> None:
    """Gate for a window CSV: distinct episode_id per kind (pump vs not-pump when there is no kind column)."""
    if "kind" in df.columns:
        got = {KIND_TO_CLASS.get(k, k): int(g["episode_id"].nunique()) for k, g in df.groupby("kind")}
        counts = {c: got.get(c, 0) for c in CLASSES}
    else:
        counts = {"pump": int(df.loc[df["label"] == 1, "episode_id"].nunique()),
                  "negative": int(df.loc[df["label"] == 0, "episode_id"].nunique())}
    gate(counts, minimum)


def main(argv=None):
    import argparse
    p = argparse.ArgumentParser(prog="pumpml.labels")
    p.add_argument("cmd", choices=["validate", "report"])
    p.add_argument("--file")
    a = p.parse_args(argv)
    rows = load(Path(a.file) if a.file else None)
    errs = validate(rows)
    if errs:
        raise SystemExit("\n".join(errs))
    if a.cmd == "validate":
        print(f"ok: {len(rows)} episodes")
        return
    d = Path(a.file).parent if a.file else LABELS_DIR
    (d / "REPORT.md").write_text(report(rows), encoding="utf-8")
    (d / "REVIEW.md").write_text(review(rows), encoding="utf-8")
    print(json.dumps(Counter(r["class"] for r in rows)))


if __name__ == "__main__":
    main()
