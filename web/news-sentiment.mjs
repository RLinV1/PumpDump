import { NEWS_MODEL, loadTextClassifier, sentimentLabel } from "./text-models.mjs";
import { MODEL_CACHE_DIR } from "./bluesky-sentiment.mjs";

export function createNewsSentimentLoader({ loadNews, enabled = false, loadClassifier = () => loadTextClassifier(NEWS_MODEL, MODEL_CACHE_DIR) }) {
  const cache = new Map(), pending = new Map();
  let classifier, inference = Promise.resolve();
  return async function load(ticker = null) {
    const data = await loadNews(ticker);
    if (!enabled) return data;
    const key = `${ticker ?? "market"}:${data.asOf}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 4) return { ...data, sentimentModel: NEWS_MODEL.name, sentimentStatus: "busy" };
    const work = (async () => {
      try {
        classifier ??= Promise.resolve().then(loadClassifier);
        const classify = await classifier;
        const items = [];
        for (const item of data.items) {
          const next = inference.then(() => classify(item.title));
          inference = next.catch(() => {});
          const result = [].concat(await next)[0];
          items.push({ ...item, sentiment: sentimentLabel(result?.label) });
        }
        return { ...data, items, sentimentModel: NEWS_MODEL.name, sentimentStatus: "ready" };
      } catch {
        classifier = undefined;
        return { ...data, sentimentModel: NEWS_MODEL.name, sentimentStatus: "error" };
      }
    })().then((result) => {
      if (result.sentimentStatus === "ready") cache.set(key, result);
      if (cache.size > 31) cache.delete(cache.keys().next().value);
      return result;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
