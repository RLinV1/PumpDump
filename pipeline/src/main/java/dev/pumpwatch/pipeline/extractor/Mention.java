package dev.pumpwatch.pipeline.extractor;

import java.time.Instant;

/** One watchlist ticker found in one post; eventTime is the post's creation time. */
public record Mention(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, String source,
                      String postId, String authorId) {
    public static final int VERSION = 1;
}
