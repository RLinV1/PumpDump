## Intent

Use Financial DistilRoBERTa on financial-news headlines and try FinTwitBERT plus CardiffNLP irony on social financial posts. Test on confusing synthetic posts and retain all misses. No model is represented as perfectly understanding sarcasm.

## Design

Pinned local ONNX models; separate labels for tone and possible irony. Existing sample filtering, transient-text retention, serial queue, limits, privacy and rules-score separation remain. Headline enrichment is optional and cached/coalesced, preserving news when inference fails. Social sampling returns separate irony counts without reversing tone labels. Public mock mode remains labelled; actual model execution is verified with synthetic-input scripts.

## Validation

- [x] Compare both sentiment models and irony on the same 46-case synthetic set.
- [x] Verify stream/top/latest filtering and actual news/social inference with synthetic inputs.
- [x] Test independent irony counts, safe label mapping, news cache/coalescing and inference failure fallback.
- [x] Build Docker with all model assets and verify offline inference.
- [x] Run full checks; update UI screenshots and evaluation documentation.
