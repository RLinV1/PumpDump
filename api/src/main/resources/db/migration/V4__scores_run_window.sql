-- Serves MAX(window_end) per run for the bounded latest-score read, and the retention delete.
CREATE INDEX api_scores_run_window ON api_scores (run_id, window_end DESC);
