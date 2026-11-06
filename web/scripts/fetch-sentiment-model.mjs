// Downloads the pinned Financial DistilRoBERTa weights into SENTIMENT_MODEL_DIR (default: the local dev cache) and runs one
// classification, so a Docker build or a first local run fails loudly if the model cannot load.
//   node scripts/fetch-sentiment-model.mjs
import { MODEL_CACHE_DIR, loadClassifier } from "../bluesky-sentiment.mjs";

const classify = await loadClassifier();
const [result] = [].concat(await classify("The company raised its guidance after record quarterly revenue."));
if (!["positive", "negative", "neutral"].includes(String(result?.label).toLowerCase())) throw new Error("Unexpected model output");
console.log(`Financial DistilRoBERTa ready in ${MODEL_CACHE_DIR} (self-test label: ${result.label})`);
