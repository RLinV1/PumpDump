-- Next-hour swing forecast (median, upperBand, regime) as JSON; null until a forecast exists.
ALTER TABLE api_scores ADD COLUMN swing jsonb;
