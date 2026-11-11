package dev.pumpwatch.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * A social post reduced to derived fields (schema 2). eventTime is the post creation time; ingestTime is the fetch
 * time. authorId is a one-way key from {@link Keys#authorKey}, tickers are the watchlist symbols linked at ingestion
 * and simhash is {@link SimHash#of}. {@code text} is null unless a source is explicitly configured to retain it.
 */
public record PostRecord(int schemaVersion, Instant eventTime, Instant ingestTime, String source, String postId,
                         String authorId, Instant authorCreatedAt, List<String> tickers, long simhash,
                         @JsonInclude(JsonInclude.Include.NON_NULL) String text) {
    public PostRecord {
        tickers = tickers == null ? List.of() : List.copyOf(tickers);
    }
}
