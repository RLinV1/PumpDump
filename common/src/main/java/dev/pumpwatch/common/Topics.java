package dev.pumpwatch.common;

import java.util.List;

public final class Topics {
    public static final String RAW_POSTS = "raw-posts";
    public static final String TICKS = "ticks";
    public static final String RAW_NEWS = "raw-news";
    public static final String RAW_FILINGS = "raw-filings";
    public static final String INGEST_DLQ = "ingest-dlq";
    public static final String MENTIONS = "mentions";
    public static final String FEATURES = "features";
    public static final String SCORES = "scores";
    public static final String FLAGS = "flags";
    public static final String SOURCE_HEALTH = "source-health";
    public static final List<String> ALL =
            List.of(RAW_POSTS, TICKS, RAW_NEWS, RAW_FILINGS, INGEST_DLQ, MENTIONS, FEATURES, SCORES, FLAGS,
            SOURCE_HEALTH);

    private Topics() {}

    /** Topic name for an isolated replay run, so replays cannot pollute live consumers. */
    public static String forRun(String topic, String runId) {
        if (runId == null || !runId.matches("[A-Za-z0-9-]+")) {
            throw new IllegalArgumentException("runId must be non-blank and match [A-Za-z0-9-]+: " + runId);
        }
        return "replay." + runId + "." + topic;
    }
}
