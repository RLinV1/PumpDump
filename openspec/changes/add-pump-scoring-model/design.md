# Design

## Context

See proposal.md for why. The system architecture is in `define-system-architecture`: features are built by a stream stage from the raw topics, written to a Postgres table, scored by a `Scorer`, and flagged. This design covers how the model itself is built, trained, evaluated and served.

The problem is a classification of ticker-time windows into pump, hype, news-backed move and normal. The signal is the combination: a pump has chatter that is new-account heavy and copy-pasted, a price and volume jump, and an absence of any filing or news that explains it. Hype has chatter and a jump but may have genuine accounts and varied text. A news-backed move has a catalyst. No single feature separates them, which is why a learned model is justified, and why the rule baseline must be beaten rather than assumed.

## Model types you need

| Role | Type | Tool | Why |
| --- | --- | --- | --- |
| Main score | Supervised gradient-boosted decision trees (binary or four-class classifier) | LightGBM | Small tabular data, few labels, fast on a CPU, supports monotone constraints |
| Cold start, before labels exist | Unsupervised anomaly detection: z-scores per feature against its own history, combined by rules, optionally Isolation Forest | scikit-learn | Works with no labels, transparent |
| Calibration | Isotonic regression | scikit-learn | Makes a score mean an observed rate |
| Promotional-language feature | Logistic regression on sentence embeddings | scikit-learn with `all-MiniLM-L6-v2` | Small and free; a large language model is not needed |
| Near-duplicate posts | SimHash (not a learned model) | Plain code | Cheap, deterministic, runs in the stream |

Not needed: deep neural networks, a fine-tuned transformer, reinforcement learning, or any paid model API.

## Data availability, honestly

Free sources do not provide historical social data, so a model cannot be trained on social features for past pumps. The plan is two stages. Version 1 is trained on market and catalyst features, which are available for past episodes from free historical bars and filings. Social features are recorded live from the day recording starts, and a version that includes them is trained once enough recorded days exist. Until then the social features feed the rule baseline and the evidence panel, not the trained model. Sources whose terms forbid training on their content are marked live-scoring only and are excluded from training data.

## Goals / Non-Goals

**Goals:**
- A model that is honest about what it knows, with metrics a reader can trust.
- Training and live scoring that cannot disagree about the features.
- Zero cost: CPU-only training on a laptop, free licenses throughout.

**Non-Goals:**
- Predicting prices, recommending trades, or detecting manipulation types beyond pump-style promotion.
- Deep learning end to end, or any paid model API.

## Decisions

**Model family: gradient-boosted trees (LightGBM).** The inputs are about thirty tabular features, labels are few, and trees handle small tabular data well, train in seconds on a CPU, and support monotonic constraints. Alternative: a neural network or a fine-tuned transformer on raw text. Rejected: not enough labels, harder to explain, and slower to serve.

**Feature emission: final windows only.** The feature stage suppresses each hopping window until stream time passes its end plus the 2 minute grace (`suppress(untilWindowCloses)`), so a window is written once, with its final value, and its eventTime (the window end) is never ahead of the data. Running totals (the earlier behaviour) put eventTime in the future relative to wall clock and made the output depend on commit timing; final windows make live and replay produce identical features, which the reproducibility test asserts. Cost: a flag appears at least the 2 minute grace after the window ends, and a quiet partition only closes windows when a later record arrives on it. The scorer is unchanged: it reads the same feature names, one record per window. Alternative: emit running totals. Rejected for the reasons above.

**Feature state and baselines.** Per-window totals and a per-ticker context (hourly mention and volume buckets for the trailing seven-day baseline, plus recent 8-K and news catalysts) live in Kafka Streams state stores with changelog topics, so nothing needed after a restart is held in memory. Baseline and catalyst reads are bounded by the window being closed, so later records cannot change it. Before one full hour of history exists the mention baseline falls back to `pipeline.baseline-mentions-per-minute` and `volumeRatio` is 1. Catalysts older than the 24 hour lookback are pruned relative to the latest event time seen. Post text is reduced to a SimHash and a new-account flag in the extractor and is not forwarded or stored.

**Catalyst constraint.** The model is trained with a monotone-decreasing constraint on the catalyst features, so adding a filing or news can never raise the score. This encodes the product's central claim directly and is checked by a test. Alternative: trusting the model to learn it. Rejected: with few labels it may not, and the failure would be embarrassing.

**Text signals without a big model.** Near-duplicate share uses SimHash on tokens inside the stream: cheap, deterministic and free. A promotional-language score comes from a small classifier (logistic regression) on sentence embeddings from `all-MiniLM-L6-v2` (Apache-2.0), trained on labeled promotional versus ordinary posts. The embedding model runs offline to create features for training and, if used live, runs in a small local service. Alternative: FinBERT. Rejected: its license is CC BY-NC-SA 4.0, which restricts commercial use and requires share-alike, so it is not free to use in general. Alternative: calling an LLM API. Rejected: it costs money.

**Labels.** Positives come from public enforcement records and documented cases. Negatives are news-backed big movers, hype without manipulation, and matched random controls. Each episode stores its source URL. Because pumps are rare and the set will be small, the pipeline reports counts, refuses to train below a minimum, and uses time-based cross-validation with class weights. Weak labels from the rule scorer may add training volume but are never used in the test set.

**Evaluation.** Time-based split with whole episodes kept together, bootstrap confidence intervals, and two baselines: the transparent rule score and a chatter-volume-only score. The model is promoted only if it beats both on the held-out period and passes the catalyst monotonicity test. If it does not, the product ships with the rule scorer and says so.

**Calibration.** The flag level is chosen on held-out data with isotonic calibration, so a score of 80 corresponds to an observed rate, not an arbitrary number.

**Serving.** The trained model and calibration are exported to ONNX and run in the Java scorer with ONNX Runtime, so there is no Python in the hot path. A startup self-check scores a stored reference input and compares it with the expected value; on mismatch the scorer falls back to rules. Alternative: a Python sidecar. Rejected for the hot path, kept as a fallback if a feature does not export cleanly.

**Explanation.** Feature-group occlusion: re-score with the social, market or catalyst group reset to its baseline and report the drop. It is model-agnostic and needs three extra predictions per flag.

**Training code lives in `ml/`** (Python, `uv` or `pip`, pinned versions), reads features from Postgres or an exported file, and writes `models/<version>/` containing the ONNX file, calibration, reference input and model card.

## Risks / Trade-offs

- [No free historical social data, so social features cannot be trained on past pumps] → Two-stage plan above, and record live data from day one.
- [Too few labeled pumps to train or test] → Minimum-count gate, honest reporting, ship rules if the model cannot be justified, and grow the dataset over time.
- [Label noise: enforcement dates are broader than the real pump] → Store confidence per episode, widen windows conservatively, and report sensitivity to window choice.
- [Concept drift: pump playbooks change] → Time-based evaluation shows decay, and the promotion gate allows retraining on recent data.
- [Survivorship: public cases are the ones that were caught] → State this limit in the model card; the system claims to flag pump-like behavior, not to prove manipulation.
- [Feature leakage] → Look-ahead tests on every feature, and the split keeps episodes whole.
