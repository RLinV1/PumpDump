"""Model card: data, size, metrics, limits, licenses, date. Written beside the model only when it is promoted."""
import datetime
from importlib.metadata import version
from pathlib import Path

LICENSES = {"lightgbm": "MIT", "scikit-learn": "BSD-3-Clause", "pandas": "BSD-3-Clause", "numpy": "BSD-3-Clause"}
LIMITS = [
    "Version 1 uses market and catalyst features only; social features are not in this model.",
    "Positives come from caught cases (survivorship): the score means pump-like behavior, not proof of manipulation.",
    "Enforcement dates are broader than the real pump, so labels are noisy.",
    "The model decays as pump playbooks change; retrain on recent data and re-run the gate.",
]


def write_card(model_dir: Path, info: dict, report: dict, df, train) -> Path:
    def row(name):
        m = report[name]
        cells = [f"{m[k]['value']:.3f} ({m[k]['ci95'][0]:.3f} to {m[k]['ci95'][1]:.3f})"
                 if m[k]["ci95"][0] is not None else "n/a"
                 for k in ("pr_auc", "precision_top_flags_per_day", "false_flags_per_normal_day", "median_lead_minutes")]
        return f"| {name} | " + " | ".join(cells) + " |"

    m = report["model"]
    lines = [
        f"# Model card: {model_dir.name}", "", f"Date: {datetime.date.today().isoformat()}", "",
        "## Data", report["data"],
        f"- Episodes: {df['episode_id'].nunique()} ({df.loc[df['label'] == 1, 'episode_id'].nunique()} pumps), "
        f"windows: {len(df)}, training windows: {len(train)}",
        f"- Period: {df['window_end'].min()} to {df['window_end'].max()}",
        f"- Features: {', '.join(info['features'])}",
        f"- Model size: {(model_dir / 'model.txt').stat().st_size} bytes",
        "", "## Flag level",
        f"- Level {info['flag_level']:.1f} of 100, chosen on {info['calibrated_on']['windows']} held-out windows "
        f"({info['calibrated_on']['pump_episodes']} pump episodes), calibrated {info['calibrated_on']['date']}",
        f"- Target precision {info['target_precision']}; test precision among top flags per day "
        f"{m['precision_top_flags_per_day']['value']:.3f}, false flags per normal day "
        f"{m['false_flags_per_normal_day']['value']:.3f}",
        "", f"## Metrics on the held-out test period ({m['n_pump_episodes']} pump episodes of {m['n_episodes']})",
        "| scorer | PR-AUC | precision, top flags per day | false flags per normal day | median lead (min) |",
        "| --- | --- | --- | --- | --- |", row("model"), row("rules"), row("volume"),
        "", "Values show the estimate with a 95% bootstrap interval over episodes.",
        "", "## Known limits", *[f"- {x}" for x in LIMITS],
        "", "## Licenses", *[f"- {n} {version(n)}: {lic}" for n, lic in LICENSES.items()],
    ]
    p = model_dir / "model-card.md"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p
