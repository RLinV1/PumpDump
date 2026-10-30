# Live Bluesky sentiment

`web/bluesky-sentiment.mjs` serves the live sentiment feature. The existing Python LightGBM pipeline in
this directory remains the offline pump-model training path. These are separate models and outputs.

## Recent top and latest posts

The panel defaults to top-ranked posts from the last 24 hours. `web/bluesky-search.mjs` queries
`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts` with the ticker cashtag, `since`/`until`, English
language and either `sort=top` or `sort=latest`. The public cached host returned HTTP 403 during local
verification; the AppView host above returned actual results without configured credentials.

At most 50 returned results are considered and 25 matching, unique posts are classified. Both search
and streaming use the shared ticker matcher: cashtags match directly; plain uppercase symbols require
financial context. Created timestamps must be inside the requested day. Search ranking is supplied by
Bluesky; this application filters the results but does not invent an engagement score. These are sampled
posts, not all ticker discussion or a representative survey of users.

Search shares the same pretrained model and serial inference scheduler as streaming. It caches only
aggregate label counts/metadata for 60 seconds, coalesces concurrent identical reads, and bounds cache
entries, concurrent requests and provider request frequency. Errors have a five-second cooldown and are
reported as unavailable, not fabricated zero counts. Search text and author data are not returned or
persisted. Deleted posts disappear when the provider refreshes its results; this one-minute aggregate
cache does not offer instantaneous deletion invalidation.

The API accepts `?sample=top`, `?sample=latest` or `?sample=stream`. Omitting the parameter preserves
the streaming contract for existing clients. Search responses use `windowMinutes: 1440` and
`sample: { sort, examined }`; streaming keeps its one-hour response without search metadata.

Local real-model verification on 2026-10-30 classified 2 relevant AMC posts from 49 top search results
(both neutral), and 25 NVDA posts from 50 top results (4 positive, 14 neutral, 7 negative). These are
time-specific samples demonstrating data flow, not a sentiment accuracy evaluation or fixed expected counts.

## Live-stream collection

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
Only posts naming a tracked cashtag, or an uppercase tracked ticker alongside a finance word,
enter classification. The configured watchlist is always tracked. Selecting a mover also tracks that
symbol from the first sentiment read onward, even without a risk score. At most 64 additional selected
symbols are tracked; the least recently read selection is evicted at the limit, and selections expire
after one hour without reads. The live-stream view does not backfill historical posts; recent searches
are a separate sample and are not inserted into the one-hour stream aggregate.
The model receives at most 256 tokens from a post. A single inference runs at a
time across both sources, with bounded classification/stream queues, a ten-second inference deadline
and at most 10,000 retained streaming samples. Drops
are reported. Reconnection resumes from the latest event cursor. Deletes remove the matching sample,
including an inference still in progress.

The public snapshot contains one-hour counts by sentiment label for the selected ticker, model and
stream status, last sample time and the global drop count. Empty samples remain empty. Raw text stays
only in the bounded inference queue and is discarded after classification; posts, author names and
author identifiers are never returned, logged, written to disk or used to retrain a model. Hashed
record identifiers and labels remain in memory for deduplication, deletion handling and hourly expiry.
Restarting the service clears those aggregates.

Local verification on 2026-10-30 loaded the pinned model and ran actual CPU inference on three synthetic
financial sentences; the examples produced positive, negative and neutral labels respectively. The live
app reported `modelStatus: ready` and `streamConnected: true`. Desktop and mobile browser checks showed
the connected sentiment panel without page errors or horizontal overflow. A ten-second independent
stream check received 505 events and no watchlist cashtag matches; zero aggregate samples remain valid.
These checks establish model execution and stream connectivity, rather than sentiment accuracy on real posts.

This classifier was trained on financial news, not evaluated as a Bluesky trading predictor. Slang,
sarcasm, non-English posts and ticker ambiguity can produce errors. Its label counts describe the
sampled text; they do not establish price direction, manipulation, model calibration or investment
quality. The dashboard's `rules-v1` risk score remains a separate output.
