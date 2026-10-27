package dev.pumpwatch.common;

import java.time.Instant;

/** eventTime is the post creation time; ingestTime is the fetch time. */
public record PostRecord(int schemaVersion, Instant eventTime, Instant ingestTime, String source, String postId,
                         String authorId, Instant authorCreatedAt, String text) {}
