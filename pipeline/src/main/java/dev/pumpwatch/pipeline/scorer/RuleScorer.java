package dev.pumpwatch.pipeline.scorer;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Score;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Threshold-and-weight scorer. The table is documented in docs/rule-scorer.md; RuleScorerTest keeps them equal. */
public class RuleScorer implements Scorer {
    public static final String VERSION = "rules-v1";

    /** One row of the table: a term earns {@code points} when {@code feature >= atLeast}. */
    public record Term(String name, String group, String feature, double atLeast, double points) {}

    public static final List<Term> TERMS = List.of(
            new Term("mention surge", "social", "mentionRatio", 3, 20),
            new Term("mention surge", "social", "mentionRatio", 10, 35),
            new Term("broad chatter", "social", "distinctAuthors", 5, 5),
            new Term("broad chatter", "social", "distinctAuthors", 20, 10),
            new Term("price jump", "market", "return", 0.05, 20),
            new Term("price jump", "market", "return", 0.15, 35),
            new Term("traded volume", "market", "volume", 100_000, 10),
            new Term("traded volume", "market", "volume", 1_000_000, 20));

    @Override
    public String modelVersion() {
        return VERSION;
    }

    @Override
    public Score score(Features f) {
        double total = groupPoints(f).values().stream().mapToDouble(Double::doubleValue).sum();
        return new Score(SchemaVersions.SCORE, f.eventTime(), Instant.now(), f.ticker(), f.windowEnd(),
                Math.min(100.0, total), VERSION, f.staleSources());
    }

    @Override
    public List<Flag.Contributor> contributors(Features f) {
        return groupPoints(f).entrySet().stream().filter(e -> e.getValue() > 0)
                .map(e -> new Flag.Contributor(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingDouble(Flag.Contributor::delta).reversed()).toList();
    }

    private static Map<String, Double> groupPoints(Features f) {
        Map<String, Double> bestPerTerm = new LinkedHashMap<>();
        Map<String, String> groupOfTerm = new LinkedHashMap<>();
        for (Term t : TERMS) {
            groupOfTerm.put(t.name(), t.group());
            double v = f.values().getOrDefault(t.feature(), 0.0);
            if (v >= t.atLeast()) bestPerTerm.merge(t.name(), t.points(), Math::max);
        }
        Map<String, Double> perGroup = new LinkedHashMap<>();
        bestPerTerm.forEach((term, pts) -> perGroup.merge(groupOfTerm.get(term), pts, Double::sum));
        return perGroup;
    }
}
