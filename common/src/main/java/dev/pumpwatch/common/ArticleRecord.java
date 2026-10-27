package dev.pumpwatch.common;

import java.time.Instant;
import java.util.List;

public record ArticleRecord(int schemaVersion, Instant eventTime, Instant ingestTime, String source, String itemId,
                            String headline, String url, List<String> tickers, String fingerprint) {
    public ArticleRecord {
        tickers = tickers == null ? List.of() : List.copyOf(tickers);
    }
}
