// Downloads the pinned Financial DistilRoBERTa weights into SENTIMENT_MODEL_DIR (default: the local dev cache) and runs one
// classification, so a Docker build or a first local run fails loudly if the model cannot load.
//   node scripts/fetch-sentiment-model.mjs
import { MODEL_CACHE_DIR, loadClassifier } from "../bluesky-sentiment.mjs";
import { NEWS_MODEL, loadTextClassifier } from "../text-models.mjs";

const classify = await loadClassifier();
const [result] = [].concat(await classify("The company raised its guidance after record quarterly revenue."));
if (!["positive", "negative", "neutral"].includes(String(result?.label).toLowerCase())) throw new Error("Unexpected model output");
const news = await loadTextClassifier(NEWS_MODEL, MODEL_CACHE_DIR);
const [headline] = [].concat(await news("The company raised its guidance after record quarterly revenue."));
if (headline?.label?.toLowerCase() !== "positive") throw new Error("Financial news model self-test failed");
console.log(`FinTwitBERT + CardiffNLP irony and Financial DistilRoBERTa ready in ${MODEL_CACHE_DIR} (social label: ${result.label}, news label: ${headline.label})`);
