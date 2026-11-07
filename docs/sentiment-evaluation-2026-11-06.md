# Sentiment model evaluation — November 6, 2026

## Source-specific models

- Financial news headlines: Financial DistilRoBERTa, `Xenova/distilroberta-finetuned-financial-news-sentiment-analysis`, revision `e6953e30167c7fc3d1ad62f3df31617dd712fbc1`.
- Financial social posts: [FinTwitBERT-sentiment](https://huggingface.co/StephanAkkerman/FinTwitBERT-sentiment). Local runtime uses the [ONNX conversion](https://huggingface.co/kingsman34/FinTwitBERT-sentiment-ONNX), revision `86b65f366ecbb778e3764af9f29ed947fbee94d8`. BULLISH/BEARISH map to positive/negative.
- Possible irony: [CardiffNLP Twitter RoBERTa irony](https://huggingface.co/cardiffnlp/twitter-roberta-base-irony), via the [Xenova ONNX conversion](https://huggingface.co/Xenova/twitter-roberta-base-irony), revision `170664e4f255671a688efb6095771566bf318b0c`.

All inference is local CPU ONNX. Repository code is not executed. Financial-post sentiment and possible irony are separate outputs. An irony flag never automatically flips a positive label to negative. News tone uses only the headline text, not the full article or a price forecast.

## Synthetic challenge set

`web/scripts/fixtures/sentiment-challenges.json` contains **46 developer-authored synthetic posts**, with intended overall-tone labels. No real user posts were retained. This small set is a development diagnostic, not a representative, independent or statistically strong accuracy benchmark. Mixed claims and sarcasm can have disputable intended labels.

| Category | Financial DistilRoBERTa | FinTwitBERT |
| --- | --- | --- |
| Clear positive/negative/neutral | 11/12 | 12/12 |
| Negation | 8/8 | 5/8 |
| Sarcasm | 1/6 | 4/6 |
| Mixed results | 5/6 | 4/6 |
| Slang | 5/6 | 5/6 |
| Quoted claims | 3/4 | 4/4 |
| Multiple tickers, overall tone | 4/4 | 4/4 |
| Total | **37/46 (80.4%)** | **38/46 (82.6%)** |

FinTwitBERT improved this set's sarcasm and clear examples but regressed on negation and mixed results. A one-case overall difference does not establish general superiority. Several incorrect predictions had high model scores; those scores are not calibrated probabilities of financial truth.

The irony detector flagged **5/6** intended sarcasm cases and **12/40** other cases. That false-flag rate is too high to treat its output as a fact or use it to reverse sentiment mechanically. The UI says “possible irony” and discloses false flags.

The complete predictions, intended labels and misses are preserved in [baseline](performance/2026-11-06/sentiment-news-baseline.json) and [social plus irony](performance/2026-11-06/sentiment-social-irony.json) reports. In particular, the financial-news model labelled the synthetic bankruptcy/default sentence neutral; FinTwitBERT misread “avoided the expected loss” and some positive results phrased through negation. These failures are retained, not relabelled to improve the score.

## Pipeline checks with actual model weights

`node scripts/check-sentiment.mjs` runs synthetic positive, neutral and negative inputs through the real ONNX models. It verifies:

- the enabled stream collector reports one of each label;
- top and latest search modes report the same three classified inputs;
- duplicate posts and posts for an unrelated ticker are excluded;
- disabled collection stays disabled;
- synthetic news headlines use Financial DistilRoBERTa, while social posts use FinTwitBERT with its separate irony check;
- returned aggregates contain no author identifier.

Run it in the built web container with `docker compose exec -T web node scripts/check-sentiment.mjs`. Run the harder comparison with `node scripts/eval-sentiment.mjs /tmp/news-baseline.json` and `node scripts/eval-sentiment.mjs /tmp/social.json --social`. Synthetic inputs test execution and reveal mistakes; they do not prove performance on real Bluesky posts.

## Fine-tuning experiment before stronger claims

Collect an appropriately permitted, human-reviewed financial-post dataset labelled for target ticker, intended sentiment and sarcasm/uncertainty. Split by time, author/conversation and near-duplicate groups so paraphrases do not leak across train and evaluation. Keep this challenge set out of training.

Compare the unchanged baseline, FinTwitBERT, and a tuned candidate on a separate held-out set. Report per-class precision/recall/F1, sarcasm precision and recall, false irony flags, abstention coverage, CPU latency and memory. Review ambiguous examples rather than forcing them into confident bullish/bearish labels. Promote only if the intended improvements hold without unacceptable regressions. No fine-tuning or model-accuracy guarantee is claimed by this implementation.
