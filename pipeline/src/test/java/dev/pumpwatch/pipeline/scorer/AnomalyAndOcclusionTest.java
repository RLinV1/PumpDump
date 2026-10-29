package dev.pumpwatch.pipeline.scorer;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.pipeline.features.Ctx;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AnomalyAndOcclusionTest {
    static Features f(Map<String, Double> values) {
        return new Features(1, at(10, 0), at(10, 1), "GME", at(9, 55), at(10, 0), 5, values, null);
    }

    // --- anomaly baseline ---

    @Test
    void noZScoreUntilThirtyObservations() {
        var h = AnomalyBaseline.History.EMPTY;
        for (int i = 0; i < AnomalyBaseline.MIN_HISTORY - 1; i++) h = h.observe(Map.of("return", 0.01));
        assertThat(h.zScores(Map.of("return", 0.5))).isEmpty();
        h = h.observe(Map.of("return", 0.01));
        assertThat(h.zScores(Map.of("return", 0.5))).containsKey("z.return");
    }

    @Test
    void zScoreIsDistanceInStandardDeviations() {
        var h = AnomalyBaseline.History.EMPTY;
        for (int i = 0; i < 40; i++) h = h.observe(Map.of("volume", i % 2 == 0 ? 90.0 : 110.0)); // mean 100, sd ~10.1
        double z = h.zScores(Map.of("volume", 130.0)).get("z.volume");
        assertThat(z).isCloseTo(30 / Math.sqrt(40 * 100.0 / 39), within(1e-9));
        assertThat(h.zScores(Map.of("volume", 100.0)).get("z.volume")).isCloseTo(0, within(1e-9));
    }

    @Test
    void surgeOutOfFlatHistoryIsCappedNotInfinite() {
        var h = AnomalyBaseline.History.EMPTY;
        for (int i = 0; i < 40; i++) h = h.observe(Map.of("mentionRatio", 0.0));
        assertThat(h.zScores(Map.of("mentionRatio", 5.0)).get("z.mentionRatio")).isEqualTo(AnomalyBaseline.MAX_Z);
        assertThat(h.zScores(Map.of("mentionRatio", 0.0)).get("z.mentionRatio")).isZero();
    }

    @Test
    void historyRoundTripsThroughJson() {
        var h = AnomalyBaseline.History.EMPTY.observe(Map.of("return", 0.02)).observe(Map.of("return", 0.04));
        assertThat(Json.fromJson(Json.toJson(h), AnomalyBaseline.History.class)).isEqualTo(h);
    }

    // --- occlusion ---

    @Test
    void eachGroupIsResetAndTheDropReported() {
        Map<String, Double> v = Map.of("mentionRatio", 10.0, "return", 0.06, "volumeRatio", 1.0);
        List<Flag.Contributor> c = new RuleScorer().contributors(f(v));
        assertThat(c).extracting(Flag.Contributor::featureGroup).containsExactly("social", "market");
        assertThat(c).extracting(Flag.Contributor::delta).containsExactly(35.0, 20.0);
    }

    @Test
    void catalystReportsANegativeDeltaAndSortsByEffectSize() {
        Map<String, Double> v = Map.of("mentionRatio", 3.0, "return", 0.2, "filings24h", 1.0, "item.1.01", 1.0);
        List<Flag.Contributor> c = new RuleScorer().contributors(f(v)); // 20 + 35 - 20 = 35
        assertThat(c).extracting(Flag.Contributor::featureGroup).containsExactly("market", "social", "catalyst");
        assertThat(c).extracting(Flag.Contributor::delta).containsExactly(35.0, 20.0, -20.0);
    }

    @Test
    void groupsWithNoEffectAreLeftOutAndAQuietWindowHasNoContributors() {
        assertThat(new RuleScorer().contributors(f(Map.of("mentions", 4.0, "volumeRatio", 1.0)))).isEmpty();
        assertThat(new RuleScorer().contributors(f(Map.of("return", 0.06)))).extracting(Flag.Contributor::featureGroup)
                .containsExactly("market");
    }

    @Test
    void zFeaturesBelongToTheirGroupAndWorkForTheAnomalyScorer() {
        List<Flag.Contributor> c = RuleScorer.anomaly().contributors(f(Map.of("z.mentionRatio", 6.0, "z.return", 3.0)));
        assertThat(c).extracting(Flag.Contributor::featureGroup).containsExactly("social", "market");
        assertThat(c).extracting(Flag.Contributor::delta).containsExactly(35.0, 20.0);
    }

    @Test
    void worksForAnyScorerAndResetsToQuietValues() {
        Map<String, Double> seen = new HashMap<>();
        Scorer probe = new Scorer() {
            @Override public String modelVersion() { return "probe"; }

            @Override public Score score(Features x) {
                seen.putAll(x.values());
                return new Score(1, x.eventTime(), x.eventTime(), x.ticker(), x.windowEnd(),
                        x.values().getOrDefault("volumeRatio", 0.0) * 10, "probe", null);
            }
        };
        Map<String, Double> v = Map.of("volumeRatio", 4.0, "minutesSinceCatalyst", 5.0, "mentions", 9.0);
        // volumeRatio quiet value is 1, so occluding market drops 40 -> 10 = 30
        assertThat(probe.contributors(f(v))).singleElement().satisfies(c -> {
            assertThat(c.featureGroup()).isEqualTo("market");
            assertThat(c.delta()).isEqualTo(30.0);
        });
        assertThat(Occlusion.reset(f(v), "catalyst").values()).containsEntry("minutesSinceCatalyst", Ctx.NO_CATALYST_MINUTES);
        assertThat(Occlusion.reset(f(Map.of("item.1.01", 1.0, "z.return", 4.0)), "catalyst").values())
                .containsEntry("z.return", 4.0).doesNotContainKey("item.1.01");
    }
}
