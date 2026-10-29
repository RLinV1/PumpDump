package dev.pumpwatch.pipeline.scorer;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.pipeline.features.Ctx;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Feature-group occlusion: re-score with one group (social, market, catalyst) reset to its quiet baseline and report
 * the drop. Model-agnostic, three extra scorings per call. A catalyst group that lowered the score reports a negative
 * delta. Groups with no effect are left out; the rest are sorted by size of effect, largest first.
 */
public final class Occlusion {
    public static final List<String> GROUPS = List.of("social", "market", "catalyst");
    private static final Set<String> SOCIAL =
            Set.of("mentions", "mentionRatio", "distinctAuthors", "newAccountShare", "duplicateShare");
    private static final Set<String> MARKET =
            Set.of("trades", "volume", "volumeRatio", "dollarVolume", "return", "volatility");
    private static final Set<String> CATALYST =
            Set.of("filings24h", "newsOutlets6h", "minutesSinceCatalyst", "catalystPrecededMove");
    /** A feature is quiet at 0, except these. */
    private static final Map<String, Double> QUIET =
            Map.of("volumeRatio", 1.0, "minutesSinceCatalyst", Ctx.NO_CATALYST_MINUTES);

    private Occlusion() {}

    /** The group a feature belongs to (a {@code z.} prefix is ignored), or null for a feature in no group. */
    public static String groupOf(String feature) {
        String base = feature.startsWith("z.") ? feature.substring(2) : feature;
        if (SOCIAL.contains(base)) return "social";
        if (MARKET.contains(base)) return "market";
        return CATALYST.contains(base) || base.startsWith("item.") ? "catalyst" : null;
    }

    public static List<Flag.Contributor> explain(Scorer scorer, Features f) {
        double full = scorer.score(f).score();
        List<Flag.Contributor> out = new ArrayList<>();
        for (String group : GROUPS) {
            double delta = full - scorer.score(reset(f, group)).score();
            if (Math.abs(delta) > 1e-9) out.add(new Flag.Contributor(group, delta));
        }
        out.sort(Comparator.comparingDouble((Flag.Contributor c) -> Math.abs(c.delta())).reversed());
        return out;
    }

    static Features reset(Features f, String group) {
        Map<String, Double> v = new HashMap<>();
        f.values().forEach((k, x) -> {
            if (!group.equals(groupOf(k))) v.put(k, x);
            else if (!k.startsWith("z.") && !k.startsWith("item.")) v.put(k, QUIET.getOrDefault(k, 0.0));
        });
        return new Features(f.schemaVersion(), f.eventTime(), f.ingestTime(), f.ticker(), f.windowStart(),
                f.windowEnd(), f.windowMinutes(), v, f.staleSources());
    }
}
