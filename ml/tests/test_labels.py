import pandas as pd
import pytest

from pumpml import labels, synth


def row(**kw):
    r = {"id": "P1", "ticker": "AAA", "class": "pump", "start": "2021-01-04", "end": "2021-01-10",
         "source_urls": "https://www.sec.gov/x", "note": "n", "confidence": "high", "labeled_on": "2026-01-01"}
    r.update(kw)
    return r


def test_good_row_passes():
    assert labels.validate([row()]) == []


@pytest.mark.parametrize("bad", [
    {"ticker": ""}, {"class": "hype"}, {"confidence": "maybe"}, {"start": "2021-13-01"},
    {"end": "2021-01-01"}, {"source_urls": ""}, {"source_urls": "http://sec.gov/x"}, {"labeled_on": "soon"},
])
def test_bad_rows_fail(bad):
    assert labels.validate([row(**bad)])


def test_control_needs_no_url():
    assert labels.validate([row(**{"class": "control", "source_urls": ""})]) == []


def test_duplicate_id():
    assert any("duplicate" in e for e in labels.validate([row(), row(ticker="BBB")]))


def test_conflicting_overlap_only():
    other = row(id="N1", **{"class": "news_mover", "start": "2021-01-08", "end": "2021-01-12"})
    assert any("overlaps" in e for e in labels.validate([row(), other]))
    assert labels.validate([row(), row(id="P2", start="2021-01-08", end="2021-01-12")]) == []  # same class is fine
    assert labels.validate([row(), other | {"ticker": "BBB"}]) == []


def test_committed_labels_are_valid_and_pass_the_gate():
    rows = labels.load()
    assert labels.validate(rows) == []
    labels.gate({c: sum(r["class"] == c for r in rows) for c in labels.CLASSES})


def test_report_counts():
    rows = [row(), row(id="P2", confidence="uncertain")]
    out = labels.report(rows)
    assert "| pump | 2 | 1 | 1 |" in out and "| 2021 | 2 |" in out
    assert "P2" in labels.review(rows) and "P1" not in labels.review(rows)


def test_gate_names_the_shortfall():
    with pytest.raises(SystemExit, match="control has 3 episodes"):
        labels.gate({"pump": 30, "control": 3})
    labels.gate({"pump": 20, "control": 20})


def test_gate_windows_real_vs_synthetic():
    df = synth.make_pump_dataset()
    labels.gate_windows(df)  # fixture has 40+ episodes per kind
    small = df[df["episode_id"].isin(df.drop_duplicates("kind")["episode_id"])]
    with pytest.raises(SystemExit, match="refusing to train"):
        labels.gate_windows(small)
    with pytest.raises(SystemExit, match="pump has 0"):
        labels.gate_windows(pd.concat([df[df["kind"] != "pump"]]))


def test_cli_gates_real_data_but_not_synthetic(tmp_path):
    from pumpml.__main__ import main
    p = tmp_path / "w.csv"
    synth.make_pump_dataset().query("episode_id < 6").to_csv(p, index=False)
    with pytest.raises(SystemExit, match="refusing to train"):
        main(["train", "--data", str(p), "--out", str(tmp_path)])
    main(["train", "--synthetic", "--out", str(tmp_path)])
