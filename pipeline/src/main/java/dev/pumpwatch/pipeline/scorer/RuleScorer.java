package dev.pumpwatch.pipeline.scorer;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Score;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Threshold-and-weight scorer. The tables are documented in docs/rule-scorer.md; RuleScorerTest keeps them equal.
 * {@link #anomaly()} is the same machinery over the z-score features, for use before labels exist.
 */
public class RuleScorer implements Scorer {
    public static final String VERSION = "rules-v1";
    public static final String ANOMALY_VERSION = "anomaly-v1";

    /**
     * One row of the table: a term earns {@code points} when {@code feature >= atLeast}. Rows of one term are listed
     * by rising threshold; the last matching row counts. Negative points (catalyst terms) lower the score.
     */
    public record Term(String name, String group, String feature, double atLeast, double points) {}

    private static final List<Term> CATALYST_TERMS = List.of(
            new Term("news coverage", "catalyst", "newsOutlets6h", 1, -10),
            new Term("news coverage", "catalyst", "newsOutlets6h", 3, -20),
            new Term("8-K filing", "catalyst", "filings24h", 1, -20),
            new Term("catalyst before the move", "catalyst", "catalystPrecededMove", 1, -15));

    public static final List<Term> TERMS = concat(List.of(
            new Term("mention surge", "social", "mentionRatio", 3, 20),
            new Term("mention surge", "social", "mentionRatio", 10, 35),
            new Term("broad chatter", "social", "distinctAuthors", 5, 5),
            new Term("broad chatter", "social", "distinctAuthors", 20, 10),
            new Term("new accounts", "social", "newAccountShare", 0.3, 5),
            new Term("new accounts", "social", "newAccountShare", 0.6, 10),
            new Term("copied posts", "social", "duplicateShare", 0.3, 5),
            new Term("copied posts", "social", "duplicateShare", 0.6, 10),
            new Term("price jump", "market", "return", 0.05, 20),
            new Term("price jump", "market", "return", 0.15, 35),
            new Term("traded volume", "market", "volume", 100_000, 10),
            new Term("traded volume", "market", "volume", 1_000_000, 20),
            new Term("volume surge", "market", "volumeRatio", 5, 10),
            new Term("volume surge", "market", "volumeRatio", 20, 20)), CATALYST_TERMS);

    /** Same shape over z-scores (see {@link AnomalyBaseline}); a z-score below the history minimum is absent. */
    public static final List<Term> ANOMALY_TERMS = concat(List.of(
            new Term("mention surge", "social", "z.mentionRatio", 3, 20),
            new Term("mention surge", "social", "z.mentionRatio", 5, 35),
            new Term("broad chatter", "social", "z.distinctAuthors", 3, 5),
            new Term("broad chatter", "social", "z.distinctAuthors", 5, 10),
            new Term("new accounts", "social", "z.newAccountShare", 3, 5),
            new Term("new accounts", "social", "z.newAccountShare", 5, 10),
            new Term("copied posts", "social", "z.duplicateShare", 3, 5),
            new Term("copied posts", "social", "z.duplicateShare", 5, 10),
            new Term("price jump", "market", "z.return", 3, 20),
            new Term("price jump", "market", "z.return", 5, 35),
            new Term("traded volume", "market", "z.volume", 3, 10),
            new Term("traded volume", "market", "z.volume", 5, 20),
            new Term("volume surge", "market", "z.volumeRatio", 3, 10),
            new Term("volume surge", "market", "z.volumeRatio", 5, 20)), CATALYST_TERMS);

    private final String version;
    private final List<Term> terms;

    public RuleScorer() {
        this(VERSION, TERMS);
    }

    private RuleScorer(String version, List<Term> terms) {
        this.version = version;
        this.terms = terms;
    }

    public static RuleScorer anomaly() {
        return new RuleScorer(ANOMALY_VERSION, ANOMALY_TERMS);
    }

    @Override
    public String modelVersion() {
        return version;
    }

    @Override
    public Score score(Features f) {
        double total = Math.max(0.0, Math.min(100.0, points(f)));
        return new Score(SchemaVersions.SCORE, f.eventTime(), Instant.now(), f.ticker(), f.windowEnd(), total, version,
                f.staleSources());
    }

    private double points(Features f) {
        Map<String, Double> perTerm = new LinkedHashMap<>();
        for (Term t : terms) {
            if (f.values().getOrDefault(t.feature(), 0.0) >= t.atLeast()) perTerm.put(t.name(), t.points());
        }
        return perTerm.values().stream().mapToDouble(Double::doubleValue).sum();
    }

    private static List<Term> concat(List<Term> a, List<Term> b) {
        return java.util.stream.Stream.concat(a.stream(), b.stream()).toList();
    }
}
