# Live Bluesky sentiment

`web/bluesky-sentiment.mjs` serves the live sentiment feature. The existing Python LightGBM pipeline in
this directory remains the offline pump-model training path. These are separate models and outputs.

The live service runs the quantized ONNX version of
[DistilRoBERTa financial sentiment](https://huggingface.co/Xenova/distilroberta-finetuned-financial-news-sentiment-analysis)
locally through `@huggingface/transformers`. The upstream
[model card](https://huggingface.co/mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis)
declares Apache 2.0 and training on English Financial PhraseBank news sentences. The ONNX model is pinned
to revision `e6953e30167c7fc3d1ad62f3df31617dd712fbc1`; its labels are positive, neutral and negative.
Model files download on the first enabled start and cache in ignored
`.playwright-mcp/sentiment-model-cache/`. A failed load or inference reports an error, without synthetic
scores or a lexicon fallback.

When the caller enables it, one public Bluesky Jetstream connection subscribes to the post collection.
Only posts naming a configured cashtag, or an uppercase configured ticker alongside a finance word,
enter classification. The model receives at most 256 tokens from a post. A single inference runs at a
time, with 64 queued posts, a ten-second inference deadline and at most 10,000 retained samples. Drops
are reported. Reconnection resumes from the latest event cursor. Deletes remove the matching sample,
including an inference still in progress.

The public snapshot contains one-hour counts by sentiment label for the selected ticker, model and
stream status, last sample time and the global drop count. Empty samples remain empty. Raw text stays
only in the bounded inference queue and is discarded after classification; posts, author names and
author identifiers are never returned, logged, written to disk or used to retrain a model. Hashed
record identifiers and labels remain in memory for deduplication, deletion handling and hourly expiry.
Restarting the service clears those aggregates.

This classifier was trained on financial news, not evaluated as a Bluesky trading predictor. Slang,
sarcasm, non-English posts and ticker ambiguity can produce errors. Its label counts describe the
sampled text; they do not establish price direction, manipulation, model calibration or investment
quality. The dashboard's `rules-v1` risk score remains a separate output.
