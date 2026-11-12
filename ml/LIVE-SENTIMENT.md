# Source-specific local text sentiment

Social posts and financial-news headlines use different pinned CPU ONNX models.
The Java rules-v1 pump score and Python LightGBM training remain separate outputs.

| Source | Model | Output |
| --- | --- | --- |
| Bluesky posts | FinTwitBERT | Positive, neutral or negative financial-post tone |
| Same social sample | CardiffNLP Twitter RoBERTa irony | Separate possible-irony count; no label inversion |
| News headlines | Financial DistilRoBERTa | Optional headline tone, without article-body processing |

Set `DATA_MODE=live` and `SENTIMENT_ENABLED=true` for actual Bluesky sampling.
Set `NEWS_SENTIMENT_ENABLED=true` for headline classification when news credentials
are configured. Default mock mode deliberately collects no live posts. To test
actual model inference without real posts, run `node scripts/check-sentiment.mjs`
in the built web container. Docker downloads all pinned model assets at build time.

The social panel offers top-ranked or latest English posts from the last 24 hours,
or streaming samples from the last 60 minutes. Search considers at most 50 results
and classifies at most 25 relevant, unique posts. Cashtags match directly; plain
symbols require financial context. The queue is bounded, inference is serialized,
timeouts and dropped inputs are reported, and the cache coalesces repeated reads.
A post whose inference fails or times out is skipped; the model is marked as errored only
after 5 failures in a row.
One whole-post label is associated with each matching ticker; it is not target-specific.

Post text is transient. Author names and raw posts are not returned or persisted.
Hashed record identifiers, labels and possible-irony flags remain in memory for
deduplication, deletion handling and expiry. No observed posts are used for training.
News enrichment caches the current headline snapshot, coalesces parallel reads and
preserves the source headlines if its model is unavailable.

The [46-case synthetic comparison](../docs/ml/sentiment-evaluation-2026-11-06.md)
records all misses. FinTwitBERT scored 38/46, versus 37/46 for the news model on the
same social examples. Sarcasm improved from 1/6 to 4/6 but negation regressed.
The irony detector found 5/6 sarcasm examples and falsely flagged 12/40 others.
These small developer-authored tests do not establish real-world accuracy.
Sarcasm, slang, quoted claims and mixed news remain unreliable; model scores are
not calibrated probabilities of financial truth. Sentiment does not predict returns.

Run `npm test` for filtering, deletion, bounds, timeout, safe mapping, irony separation
and headline fallback checks. Run the actual-model scripts described in the evaluation
report for inference checks and the full prediction-level challenge results.