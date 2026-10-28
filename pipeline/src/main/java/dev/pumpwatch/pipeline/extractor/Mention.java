package dev.pumpwatch.pipeline.extractor;

import java.time.Instant;

/**
 * One watchlist ticker found in one post; eventTime is the post's creation time. Carries a SimHash and a
 * new-account flag instead of the post text, so raw text never leaves the extractor.
 */
public record Mention(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, String source,
                      String postId, String authorId, boolean newAccount, long simhash) {
    public static final int VERSION = 1;
}
