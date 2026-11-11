package dev.pumpwatch.common;

import java.time.Instant;
import java.util.Set;

/** eventTime is the window end. swing is null until a forecast exists. */
public record Score(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, Instant windowEnd,
                    double score, String modelVersion, Set<String> staleSources, Swing swing) {
    public Score {
        staleSources = staleSources == null ? Set.of() : Set.copyOf(staleSources);
    }
}
