package dev.pumpwatch.common;

import java.time.Instant;

/** A source reported that a post was deleted. Published to raw-posts under the post's key; consumers purge it. */
public record PostDeletion(int schemaVersion, Instant eventTime, Instant ingestTime, String source, String postId,
                           boolean deleted) {
    public PostDeletion(Instant when, String source, String postId) {
        this(SchemaVersions.POST, when, when, source, postId, true);
    }
}
