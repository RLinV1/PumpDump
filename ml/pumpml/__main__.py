"""python -m pumpml train|evaluate|vol-baseline   (add --synthetic to use the fixture data)"""
import argparse
import json
from pathlib import Path

from . import evaluate as E
from . import model as M
from . import synth, vol


def main(argv=None):
    p = argparse.ArgumentParser(prog="pumpml")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("train", "evaluate"):
        s = sub.add_parser(name)
        s.add_argument("--data", help="CSV of labeled windows (data/labels export)")
        s.add_argument("--synthetic", action="store_true", help="use the synthetic fixture instead of --data")
        s.add_argument("--out", default="models")
        s.add_argument("--version", default="dev")
        if name == "evaluate":
            s.add_argument("--current", help="model dir of the currently promoted model")
    v = sub.add_parser("vol-baseline")
    v.add_argument("--bars", help="one-minute bars CSV")
    v.add_argument("--synthetic", action="store_true")
    v.add_argument("--watchlist", nargs="*")
    v.add_argument("--out", default="vol-baseline.json")
    a = p.parse_args(argv)

    if a.cmd == "vol-baseline":
        bars = vol.synth_bars() if a.synthetic else vol.load_bars(a.bars, a.watchlist)
        print(json.dumps(vol.run(bars, a.out), indent=2))
        return
    if a.synthetic == bool(a.data):
        p.error("give exactly one of --data or --synthetic")
    df = synth.make_pump_dataset() if a.synthetic else synth.load_csv(a.data)
    note = "SYNTHETIC FIXTURE: not a real model." if a.synthetic else f"Data file: {a.data}"
    d = Path(a.out) / a.version
    if a.cmd == "train":
        info = M.train(df, d)
        print(f"trained {d}: flag level {info['flag_level']}, time-CV PR-AUC {info['cv_pr_auc']}")
    else:
        r = E.evaluate(df, d, note, Path(a.current) if a.current else None)
        print(json.dumps({k: r[k] for k in ("gate", "catalyst_violations", "flag_levels")}, indent=2))


if __name__ == "__main__":
    main()
