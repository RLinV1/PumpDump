## Why

The single default Gemini model was retired for new users (404) and free-tier quota is per model (429). One bad model sent every question to the mock agent.

## What changes

- `config.gemini_models()` returns an ordered list: env `GEMINI_MODEL` first when set, then `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`, without duplicates.
- The assistant tries the next model on a 404, a 429, a 5xx or a hung call (12 s per generate call). The Gemini attempt stops 5 s before the run deadline so the mock fallback can answer. Other errors raise at once. If every model fails, the last error reaches the existing mock fallback.
- Docs, `.env.example` and compose no longer name a single default.
