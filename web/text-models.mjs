import { existsSync } from "node:fs";
import { join } from "node:path";

// Model assets are pinned; inference stays local. No model repository code is executed.
export const NEWS_MODEL = { id: "Xenova/distilroberta-finetuned-financial-news-sentiment-analysis", revision: "e6953e30167c7fc3d1ad62f3df31617dd712fbc1", name: "Financial DistilRoBERTa" };
export const SOCIAL_MODEL = { id: "kingsman34/FinTwitBERT-sentiment-ONNX", revision: "86b65f366ecbb778e3764af9f29ed947fbee94d8", name: "FinTwitBERT", source: "StephanAkkerman/FinTwitBERT-sentiment" };
export const IRONY_MODEL = { id: "Xenova/twitter-roberta-base-irony", revision: "170664e4f255671a688efb6095771566bf318b0c", name: "CardiffNLP irony", source: "cardiffnlp/twitter-roberta-base-irony" };

export function sentimentLabel(value) {
  const label = { positive: "positive", bullish: "positive", negative: "negative", bearish: "negative", neutral: "neutral" }[String(value).toLowerCase()];
  if (typeof label !== "string") throw new Error("Invalid sentiment label");
  return label;
}

export async function loadTextClassifier(model, cacheDir) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = cacheDir;
  // Registry metadata in Transformers.js may use main even with a pinned revision.
  const localPath = join(cacheDir, model.id, model.revision);
  const local = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"].every((file) => existsSync(join(localPath, file)));
  const classifier = await pipeline("text-classification", local ? localPath : model.id, {
    revision: local ? "main" : model.revision, local_files_only: local, dtype: "q8", device: "cpu",
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  });
  return (text) => classifier(text, { truncation: true, max_length: 256 });
}

export async function loadSocialClassifier(cacheDir) {
  const sentiment = await loadTextClassifier(SOCIAL_MODEL, cacheDir);
  const irony = await loadTextClassifier(IRONY_MODEL, cacheDir);
  return async (text) => {
    const [tone, hint] = await Promise.all([sentiment(text), irony(text)]);
    const result = [].concat(tone)[0], possibleIrony = [].concat(hint)[0];
    if (!["irony", "non_irony"].includes(possibleIrony?.label)) throw new Error("Invalid irony label");
    return [{ label: sentimentLabel(result?.label), irony: possibleIrony.label === "irony" }];
  };
}
