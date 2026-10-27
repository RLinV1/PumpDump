package dev.pumpwatch.common;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

/** eventTime is the window end. */
public record Features(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, Instant windowStart,
                       Instant windowEnd, int windowMinutes, Map<String, Double> values, Set<String> staleSources) {
    public Features {
        values = values == null ? Map.of() : Map.copyOf(values);
        staleSources = staleSources == null ? Set.of() : Set.copyOf(staleSources);
    }
}
