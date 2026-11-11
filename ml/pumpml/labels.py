"""Label dataset (data/labels/): validator, report and the minimum-count gate. Metadata only: tickers, dates, URLs, notes."""
import csv
import datetime
import json
from collections import Counter
from pathlib import Path

LABELS_DIR = Path(__file__).resolve().parents[2] / "data" / "labels"
FIELDS = ["id", "ticker", "class", "start", "end", "source_urls", "note", "confidence", "labeled_on"]  # plus optional `policy`
# Each uncertain row names the policy decision(s) that cover it (space-separated). Owner answers them in decisions.json.
POLICIES = {
    "suspension_windows": "Count SEC trading-suspension windows as pump episodes? (The dates are the suspension period, and a suspension is not a finding.)",
    "long_windows": "Keep pump windows longer than 60 days, trimmed to their first 30 days?",
    "order_date_ends": "Use the order date as the end date when the scheme end is not stated?",
    "approx_dates": "Keep pump rows whose dates are month bounds or a year-end placeholder?",
    "hype_unenforced": "Count heavily hyped tickers with no enforcement action found as hype_no_manipulation negatives?",
    "news_mover_caveats": "Keep news-mover rows whose catalyst timing, size or deal status is soft (after-close news, term sheet, label change, nano-cap, COVID)?",
    "one_off": "Row-by-row call (see the one-off table); answer under `rows` in decisions.json.",
}
DECISIONS_FILE = LABELS_DIR / "decisions.json"
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
        pol = (r.get("policy") or "").split()
        if r.get("confidence") == "uncertain" and not pol:
            errs.append(f"{rid}: uncertain row needs a policy")
        if r.get("confidence") == "high" and pol:
            errs.append(f"{rid}: high-confidence row must not have a policy")
        errs += [f"{rid}: unknown policy {p}" for p in pol if p not in POLICIES]
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


def load_decisions(path: Path | None = None) -> dict:
    return json.loads((path or DECISIONS_FILE).read_text(encoding="utf-8"))


def validate_decisions(rows: list[dict], dec: dict) -> list[str]:
    errs = [f"policies.{k}: unknown policy" for k in dec.get("policies", {}) if k not in POLICIES]
    errs += [f"policies.{k}: must be true, false or null" for k, v in dec.get("policies", {}).items() if v not in (True, False, None)]
    one_off = {r["id"] for r in rows if "one_off" in (r.get("policy") or "").split()}
    errs += [f"rows.{k}: not a one_off row" for k in dec.get("rows", {}) if k not in one_off]
    errs += [f"rows.{k}: must be true, false or null" for k, v in dec.get("rows", {}).items() if v not in (True, False, None)]
    return errs


def apply_decisions(rows: list[dict], dec: dict) -> list[dict]:
    """Rows to train on: every high row, and an uncertain row only when every policy covering it is true
    (a one_off row needs its own `rows` answer). null or false excludes it. long_windows=true trims the end to day 30."""
    pol, one = dec.get("policies", {}), dec.get("rows", {})
    out = []
    for r in rows:
        names = (r.get("policy") or "").split()
        if any((one.get(r["id"]) if n == "one_off" else pol.get(n)) is not True for n in names):
            continue
        if "long_windows" in names:
            cap = (datetime.date.fromisoformat(r["start"]) + datetime.timedelta(days=29)).isoformat()
            r = r | {"end": min(r["end"], cap)}
        out.append(r)
    return out


def outcome_counts(rows: list[dict], dec: dict) -> dict[str, int]:
    kept = apply_decisions(rows, dec)
    return {c: sum(r["class"] == c for r in kept) for c in CLASSES}


def outcomes(rows: list[dict]) -> dict[str, dict]:
    """Class counts and gate status if every decision is yes, and if every decision is no."""
    one = [r["id"] for r in rows if "one_off" in (r.get("policy") or "").split()]
    out = {}
    for name, v in {"all yes": True, "all no": False}.items():
        c = outcome_counts(rows, {"policies": {k: v for k in POLICIES}, "rows": {i: v for i in one}})
        out[name] = {"counts": c, "short": [k for k, n in c.items() if n < MIN_PER_CLASS]}
    return out


def review(rows: list[dict], dec: dict | None = None) -> str:
    dec = dec or {}
    out = ["# Owner review: policy decisions", "",
           "Uncertain rows are grouped by reason. Answer each policy with true or false in `decisions.json` "
           "(`null` = undecided, rows excluded from training). A row is used only when every policy covering it is true. "
           "The row's `policy` column says which ones.", ""]
    for name, q in POLICIES.items():
        cov = [r for r in rows if name in (r.get("policy") or "").split()]
        if name == "one_off" or not cov:
            continue
        out += [f"## {name}: {len(cov)} rows", "", q, "", f"Current answer: `{dec.get('policies', {}).get(name)}`. Examples:", ""]
        for r in cov[:3]:
            out.append(f"- {r['id']} {r['ticker']} ({r['start']} to {r['end']}): {(r['source_urls'].split() or ['none'])[0]}")
        out.append("")
    one = [r for r in rows if "one_off" in (r.get("policy") or "").split()]
    out += [f"## one_off: {len(one)} rows (row by row)", "", "| id | ticker | why | link | answer |", "| --- | --- | --- | --- | --- |"]
    for r in one:
        out.append(f"| {r['id']} | {r['ticker']} | {r['note'].replace('|', '/')} | {(r['source_urls'].split() or ['none'])[0]} | `{dec.get('rows', {}).get(r['id'])}` |")
    out += ["", "## Gate status by outcome", "", "| outcome | " + " | ".join(CLASSES) + " | gate |", "| --- |" + " --- |" * (len(CLASSES) + 1)]
    for name, o in outcomes(rows).items():
        out.append(f"| {name} | " + " | ".join(str(o["counts"][c]) for c in CLASSES) + " | " + ("pass" if not o["short"] else "fail: " + ", ".join(o["short"])) + " |")
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
    dec = load_decisions((Path(a.file).parent / "decisions.json") if a.file else None)
    errs = validate(rows) + validate_decisions(rows, dec)
    if errs:
        raise SystemExit("\n".join(errs))
    if a.cmd == "validate":
        print(f"ok: {len(rows)} episodes")
        return
    d = Path(a.file).parent if a.file else LABELS_DIR
    (d / "REPORT.md").write_text(report(rows), encoding="utf-8")
    (d / "REVIEW.md").write_text(review(rows, dec), encoding="utf-8")
    print(json.dumps(Counter(r["class"] for r in rows)))


if __name__ == "__main__":
    main()
