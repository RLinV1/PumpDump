"""The Python rules baseline must equal the Java RuleScorer table, or the evaluation compares against the wrong thing."""
import re
from pathlib import Path

from pumpml.features import RULES

JAVA = Path(__file__).resolve().parents[2] / "pipeline/src/main/java/dev/pumpwatch/pipeline/scorer/RuleScorer.java"
TERM = re.compile(r'new Term\("[^"]+", "[^"]+", "([^"]+)", ([\d_.]+), (-?\d+)\)')


def test_rules_equal_rule_scorer_table():
    rows = {(f, float(t.replace("_", "")), float(p)) for f, t, p in TERM.findall(JAVA.read_text())
            if not f.startswith("z.")}
    assert rows == {(f, float(t), float(p)) for f, t, p in RULES}