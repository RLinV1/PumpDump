package dev.pumpwatch.api;

import dev.pumpwatch.common.Flag;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Public response shapes. Deliberately no text or author fields: only scores, counts and feature contributions. */
public final class Views {
    /** Fixed notice carried by every response, as a header and as a field in every JSON body. */
    public static final String NOTICE = "Risk signal only. Not investment advice. Pumpwatch is a non-commercial project.";
    public static final String NOTICE_HEADER = "X-Pumpwatch-Notice";

    private Views() {}

    public record Envelope<T>(String notice, T data) {
        public static <T> Envelope<T> of(T data) {
            return new Envelope<>(NOTICE, data);
        }
    }

    public record ScoreView(String ticker, double score, String modelVersion, Instant windowEnd, Instant computedAt,
                            Set<String> staleSources) {}

    public record FlagView(long id, String ticker, Instant raisedAt, Flag.Evidence evidence) {}

    /** Scores and flag markers share one event-time axis: windowEnd for scores, raisedAt for flags. */
    public record Timeline(String ticker, Instant from, Instant to, List<ScorePoint> scores, List<FlagMarker> flags) {}

    public record ScorePoint(Instant at, double score, String modelVersion) {}

    public record FlagMarker(long id, Instant at, double score) {}
}
