"""Eval harness for the research assistant. One command, offline by default, pass/fail against ``thresholds.json``.

    python -m evals.run_evals                 # mock data + mock agent (or Gemini when GEMINI_API_KEY is set)
    python -m evals.run_evals --agent mock    # force the rule-based agent
    python -m evals.run_evals --no-gate       # print and write results without failing on thresholds

Scores (each 0 to 1):
- tool_selection:    the expected tool was called (or, for a refusal question, none was and the answer says it cannot trade).
- numeric_accuracy:  a number within tolerance of the truth appears in the answer. Truth comes from ``lookup()`` (the risk
                     engine) or from the fake Pumpwatch API in ``fixtures.py``, not from the tool under test.
- groundedness:      every ``[file.md]`` the answer cites was really retrieved, knowledge answers cite one, and every
                     percent, dollar or decimal figure matches the evidence field and unit in its tool results. Deterministic
                     on purpose: no LLM judge, so the score does not depend on the model grading itself.
- retrieval_hit_at_3 (also @1, @5, MRR): the expected knowledge file is in the top k for each query in retrieval.jsonl.
The score file is written to ``evals/results/latest.json``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).parent
TOKEN = "eval-paper-token-0123456789abcdef0123"  # 32+ characters of the allowed alphabet; only its hash is ever stored

# Offline and deterministic by default; the app itself defaults to live data.
os.environ.setdefault("USE_MOCK_DATA", "1")
os.environ["PAPER_DB"] = str(Path(tempfile.mkdtemp(prefix="evals_paper_")) / "paper.db")

from portfolio_risk import config
from portfolio_risk.agent.client import run_agent
from portfolio_risk.lookup import lookup
from portfolio_risk.rag.search import search_knowledge

from . import fixtures

_NUM = re.compile(r"-?\d[\d,]*\.?\d*")
_CITE = re.compile(r"\[([^\[\]]+\.md)\]")
_FACT = re.compile(r"[+-]?(?:\$[+-]?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+%?|%))")


def numbers(text: str) -> list[float]:
    out = []
    for m in _NUM.findall(text):
        try:
            out.append(float(m.replace(",", "").rstrip(".")))
        except ValueError:
            pass
    return out


def truth_of(spec: dict) -> float:
    if "value" in spec:
        return float(spec["value"])
    node = lookup(spec["lookup"])
    for part in spec["path"].split("."):
        node = node[part]
    return float(node)


# Field names carry units; only explicit *Cents fields can be converted to dollars.
_FIELDS = {
    "price": ("price", "money"), "mark": ("price", "money"), "marketcap": ("marketcap", "money"),
    "cash": ("cash", "money"), "total": ("total", "money"), "pnl": ("pnl", "money"),
    "positionsvalue": ("total", "money"), "sma50": ("sma50", "money"), "sma200": ("sma200", "money"),
    "low52w": ("range", "money"), "high52w": ("range", "money"),
    "score": ("score", "number"), "beta": ("beta", "number"), "rsi": ("rsi", "number"),
    "peratio": ("pe", "number"), "delta": ("delta", "number"),
    "changepct": ("change", "percent"), "returnpct": ("change", "percent"),
    "return1ypct": ("change", "percent"), "movepct": ("change", "percent"),
    "volatilitypct": ("volatility", "percent"),
    "positivepct": ("positive", "percent"), "neutralpct": ("neutral", "percent"),
    "negativepct": ("negative", "percent"),
}
_LABEL = re.compile(
    r"positive|neutral|negative|volatility|beta|score|rsi|p/e|cash|total|p&l|market cap|"
    r"50-day (?:moving )?average|200-day (?:moving )?average|52-week range|"
    r"price|traded|return(?:ed)?|move(?:d)?|change|up|down", re.IGNORECASE,
)
_LABEL_FIELDS = {
    "p/e": "pe", "p&l": "pnl", "market cap": "marketcap", "traded": "price",
    "returned": "change", "return": "change", "moved": "change", "move": "change", "up": "change", "down": "change",
    "50-day average": "sma50", "50-day moving average": "sma50",
    "200-day average": "sma200", "200-day moving average": "sma200", "52-week range": "range",
}


def retrieved_sources(calls: list[dict]) -> set[str]:
    return {r.get("source") for c in calls if c["name"] == "search_knowledge"
            for r in (c.get("output") or {}).get("results", [])}


def _claim_field(answer: str, match: re.Match, previous_end: int) -> tuple[str, str]:
    figure = match.group()
    unit = "percent" if figure.endswith("%") else "money" if "$" in figure else "number"
    between = answer[previous_end:match.start()]
    labels = list(_LABEL.finditer(between))
    if not labels and re.fullmatch(r"\s*(?:to|and)\s*", between, re.IGNORECASE):
        labels = list(_LABEL.finditer(answer[:match.start()]))
    # Sentiment and cash labels commonly follow their value ("74% positive", "$10 cash").
    after = re.match(r"\s*(positive|neutral|negative|cash)\b", answer[match.end():], re.IGNORECASE)
    label = after.group(1).lower() if after else labels[-1].group().lower() if labels else ""
    field = _LABEL_FIELDS.get(label, label)
    if not field:
        field = {"money": "price", "percent": "change"}.get(unit, "unknown")
    return field, unit


def groundedness(answer: str, calls: list[dict]) -> dict:
    """Check citations and field/unit-specific figures, without a model grading itself."""
    sources = retrieved_sources(calls)
    cited = set(_CITE.findall(answer))
    fabricated = sorted(c for c in cited if c not in sources)
    uncited = bool(sources) and not cited
    evidence: dict[tuple[str, str], list[float]] = {}
    texts = []

    def collect(node):
        if isinstance(node, dict):
            for key, value in node.items():
                field = re.sub(r"[^a-z0-9]", "", key.lower())
                cents = field.endswith("cents")
                kind = _FIELDS.get(field.removesuffix("cents"))
                if kind and isinstance(value, (int, float)) and not isinstance(value, bool):
                    evidence.setdefault(kind, []).append(value / 100 if cents else value)
                elif key in ("text", "title") and isinstance(value, str):
                    texts.append(value)
                collect(value)
        elif isinstance(node, list):
            for value in node:
                collect(value)

    for call in calls:
        collect(call.get("output"))
    # Retrieved prose supports only figures with the same field and written unit.
    for text in texts:
        previous = 0
        for match in _FACT.finditer(text):
            evidence.setdefault(_claim_field(text, match, previous), []).extend(numbers(match.group()))
            previous = match.end()
    unsupported = []
    previous = 0
    for match in _FACT.finditer(answer):
        field, unit = _claim_field(answer, match, previous)
        have = evidence.get((field, unit), [])
        # Technical averages/ranges are commonly written without a dollar sign.
        if unit == "number" and field in ("sma50", "sma200", "range"):
            have = evidence.get((field, "money"), [])
        if not any(abs(n - value) <= 0.0101 for value in have for n in numbers(match.group())):
            unsupported.append(match.group())
        previous = match.end()
    return {"ok": not fabricated and not uncited and not unsupported, "fabricated_citations": fabricated,
            "uncited": uncited, "unsupported_figures": unsupported}


def score_question(q: dict, token: str) -> dict:
    result = run_agent(q["question"], token)
    names = result.tool_names()
    answer = result.answer
    if q.get("expected_tool"):
        tool_ok = q["expected_tool"] in names
    else:
        tool_ok = not names
    if q.get("must_say"):
        tool_ok = tool_ok and q["must_say"].lower() in answer.lower()
    if q.get("expected_source"):  # a knowledge question must be answered from the right file
        tool_ok = tool_ok and q["expected_source"] in retrieved_sources(result.tool_calls) & set(_CITE.findall(answer))
    row = {"id": q["id"], "question": q["question"], "tools": names, "tool_ok": tool_ok, "llm": result.llm, "answer": answer}
    if q.get("truth"):
        truth = truth_of(q["truth"])
        row |= {"truth": truth, "numeric_ok": any(abs(n - truth) <= q["tolerance"] for n in numbers(answer))}
    row["grounded"] = groundedness(answer, result.tool_calls)
    if q.get("expected_tool") and not result.tool_calls:
        row["grounded"]["ok"] = False
        row["grounded"]["missing_evidence"] = True
    return row


def retrieval_scores() -> dict:
    rows = [json.loads(line) for line in (HERE / "retrieval.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    ranks = []
    for r in rows:
        found = [x["source"] for x in search_knowledge(r["query"], r.get("ticker"), k=5)]
        ranks.append(found.index(r["source"]) + 1 if r["source"] in found else None)
    n = len(rows)
    at = lambda k: sum(1 for x in ranks if x is not None and x <= k) / n
    return {"queries": n, "hit_at_1": at(1), "hit_at_3": at(3), "hit_at_5": at(5), "mrr": sum(1 / x for x in ranks if x) / n,
            "misses": [r["query"] for r, x in zip(rows, ranks, strict=True) if x is None or x > 3]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--agent", choices=["auto", "mock"], default="auto", help="auto uses Gemini when GEMINI_API_KEY is set")
    parser.add_argument("--no-gate", action="store_true", help="do not fail on thresholds")
    parser.add_argument("--out", default=str(HERE / "results" / "latest.json"))
    args = parser.parse_args()
    if args.agent == "mock":
        os.environ["USE_MOCK_LLM"] = "1"

    server, os.environ["PUMPWATCH_API_URL"] = fixtures.serve()
    try:
        questions = [json.loads(line) for line in (HERE / "questions.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
        rows = [score_question(q, TOKEN) for q in questions]
        retrieval = retrieval_scores()
    finally:
        server.shutdown()

    mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
    scores = {
        "tool_selection": mean([r["tool_ok"] for r in rows]),
        "numeric_accuracy": mean([r["numeric_ok"] for r in rows if "numeric_ok" in r]),
        "groundedness": mean([r["grounded"]["ok"] for r in rows if "grounded" in r]),
        "retrieval_hit_at_3": retrieval["hit_at_3"],
    }
    thresholds = json.loads((HERE / "thresholds.json").read_text(encoding="utf-8"))
    failed = {k: v for k, v in scores.items() if v < thresholds[k]}
    llm = "gemini" if any(r["llm"] == "gemini" for r in rows) else "mock"
    report = {
        "when": datetime.now(UTC).isoformat(timespec="seconds"), "agent": llm, "data": "mock" if config.use_mock_data() else "live",
        "gemini_model": config.gemini_model() if llm == "gemini" else None, "questions": len(rows),
        "scores": scores, "thresholds": thresholds, "passed": not failed, "retrieval": retrieval, "rows": rows,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Eval: agent={llm} data={report['data']} questions={len(rows)}")
    for r in rows:
        flags = "".join([" TOOL" if not r["tool_ok"] else "", " NUM" if r.get("numeric_ok") is False else "",
                         " GROUND" if r.get("grounded") and not r["grounded"]["ok"] else ""])
        print(f"  {'FAIL' if flags else 'ok  '} {r['id']:<22} tools={','.join(r['tools']) or '-'}{flags}")
    for k, v in scores.items():
        print(f"{k:<20} {v:.3f}  (threshold {thresholds[k]})")
    print(f"retrieval            hit@1 {retrieval['hit_at_1']:.3f}  hit@3 {retrieval['hit_at_3']:.3f}  hit@5 {retrieval['hit_at_5']:.3f}  MRR {retrieval['mrr']:.3f}  ({retrieval['queries']} queries)")
    print(f"results written to {out}")
    if failed and not args.no_gate:
        print(f"GATE FAILED: {', '.join(failed)}", file=sys.stderr)
        return 1
    print("gate: passed" if not failed else "gate: skipped (--no-gate)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
