package dev.pumpwatch.common;

import java.time.Instant;
import java.util.List;

/** eventTime is raisedAt. */
public record Flag(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, Instant raisedAt,
                   Evidence evidence) {
    public record Evidence(double score, String modelVersion, List<Contributor> topContributors, long postCount,
                           long tradeCount, CatalystCheck catalyst) {
        public Evidence {
            topContributors = topContributors == null ? List.of() : List.copyOf(topContributors);
        }
    }

    public record Contributor(String featureGroup, double delta) {}

    public record CatalystCheck(boolean found, Instant lookbackStart, Instant lookbackEnd, List<String> items) {
        public CatalystCheck {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }
}
