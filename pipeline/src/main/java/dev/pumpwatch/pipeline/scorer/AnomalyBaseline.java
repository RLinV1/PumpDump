package dev.pumpwatch.pipeline.scorer;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-feature z-scores against the feature's own history, for use before labels exist. History is a running mean and
 * variance (Welford) per feature; FeatureStage keeps one {@link History} per ticker and window length in a
 * changelog-backed store and adds {@code z.<feature>} to the features it emits. {@link RuleScorer#anomaly()} combines
 * the z-scores by fixed rules.
 *
 * <p>A z-score is only reported once a feature has {@link #MIN_HISTORY} observations. The spread is floored at 5% of
 * the mean (and a tiny absolute value), and z is capped at {@link #MAX_Z}, so a surge out of a flat history reads as
 * very anomalous without producing infinities. Limit: overlapping hopping windows are not independent samples, so the
 * history understates the true spread; the thresholds in docs/rule-scorer.md are set with that in mind.
 */
public final class AnomalyBaseline {
    public static final int MIN_HISTORY = 30;
    public static final double MAX_Z = 10;
    public static final List<String> FEATURES = List.of("mentionRatio", "distinctAuthors", "newAccountShare",
            "duplicateShare", "return", "volume", "volumeRatio", "volatility", "dollarVolume");

    private AnomalyBaseline() {}

    public record Stat(long n, double mean, double m2) {
        static final Stat EMPTY = new Stat(0, 0, 0);

        Stat add(double x) {
            long k = n + 1;
            double d = x - mean;
            double mean2 = mean + d / k;
            return new Stat(k, mean2, m2 + d * (x - mean2));
        }

        double z(double x) {
            double sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
            double spread = Math.max(Math.max(sd, 0.05 * Math.abs(mean)), 1e-6);
            return Math.max(-MAX_Z, Math.min(MAX_Z, (x - mean) / spread));
        }
    }

    public record History(Map<String, Stat> stats) {
        public static final History EMPTY = new History(Map.of());

        public History {
            stats = stats == null ? Map.of() : Map.copyOf(stats);
        }

        /** {@code z.<feature>} for each feature with enough history, judged against the history before this window. */
        public Map<String, Double> zScores(Map<String, Double> values) {
            Map<String, Double> out = new HashMap<>();
            for (String f : FEATURES) {
                Stat s = stats.get(f);
                Double x = values.get(f);
                if (s != null && x != null && s.n() >= MIN_HISTORY) out.put("z." + f, s.z(x));
            }
            return out;
        }

        public History observe(Map<String, Double> values) {
            Map<String, Stat> next = new HashMap<>(stats);
            for (String f : FEATURES) {
                Double x = values.get(f);
                if (x != null) next.merge(f, Stat.EMPTY.add(x), (old, ignored) -> old.add(x));
            }
            return new History(next);
        }
    }
}
