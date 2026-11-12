package dev.pumpwatch.pipeline.features;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.Fx;
import dev.pumpwatch.pipeline.PipelineApplication;
import dev.pumpwatch.pipeline.PipelineProperties;
import dev.pumpwatch.pipeline.scorer.RuleScorer;
import dev.pumpwatch.pipeline.scorer.VolatilityScorer;
import java.io.File;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.state.KeyValueStore;
import org.junit.jupiter.api.Test;

/** The JVM's rv5, rv30, rvd, vol_ratio, tod and gap against ml/pumpml/vol.py (make_vol_bars_fixture.py). */
class BarsParityTest {
    static final ZoneId NY = ZoneId.of("America/New_York");

    static Instant ny(String t) {
        return LocalDateTime.parse(t).atZone(NY).toInstant();
    }

    @Test
    void matchesVolPy() throws Exception {
        JsonNode fx = new ObjectMapper().readTree(new File("src/test/resources/onnx-model/vol-bars-fixture.json"));
        Map<String, JsonNode> expected = new HashMap<>();
        fx.get("expected").forEach(e -> expected.put(e.get("t").asText(), e));
        Bars bars = Bars.EMPTY;
        int checked = 0;
        for (JsonNode b : fx.get("bars")) {
            Instant t = ny(b.get("t").asText());
            // open at second 0 and close at second 59 of the minute; the volume is split over the two trades
            long vol = (long) b.get("volume").asDouble(), first = vol / 2;
            Agg pane = Agg.trade(t.toEpochMilli(), b.get("open").asDouble(), first)
                    .merge(Agg.trade(t.plusSeconds(59).toEpochMilli(), b.get("close").asDouble(), vol - first));
            bars = Json.fromJson(Json.toJson(bars.add(pane)), Bars.class); // through the state store's JSON
            JsonNode e = expected.get(b.get("t").asText());
            if (e == null) continue;
            Map<String, Double> got = bars.features(t.plusSeconds(60));
            for (String f : VolatilityScorer.FEATURES) {
                assertThat(got.get(f)).as(f + " at " + e.get("t").asText()).isNotNull()
                        .isCloseTo(e.get(f).asDouble(), org.assertj.core.data.Offset.offset(1e-9));
            }
            checked++;
        }
        assertThat(checked).isEqualTo(expected.size()).isGreaterThan(40);
    }

    @Test
    void insufficientHistoryLeavesOutTheDailyInputs() {
        Bars bars = Bars.EMPTY;
        for (int i = 0; i < 100; i++) {
            bars = bars.add(Agg.trade(at(i, 0).toEpochMilli(), 10 + 0.01 * (i % 7), 100));
        }
        Map<String, Double> f = bars.features(at(100, 0));
        assertThat(f).containsKeys("rv5", "rv30", "gap", "tod").doesNotContainKeys("rvd", "vol_ratio");
        assertThat(f.get("gap")).isZero(); // first day: no previous close
    }

    /** Swing is null below 31 bars, a positive default-HAR warm-up from 31 to 390, and the normal path from 391. */
    @Test
    void warmUpSwingBetween31And390BarsThenTheNormalPath() {
        VolatilityScorer scorer = VolatilityScorer.orBaseline("");
        Bars bars = Bars.EMPTY;
        for (int n = 1; n <= 391; n++) {
            bars = bars.add(Agg.trade(at(n - 1, 0).toEpochMilli(), 10 + 0.05 * (n % 7), 100));
            if (n != 30 && n != 31 && n != 390 && n != 391) continue;
            Map<String, Double> f = bars.features(at(n, 0));
            var features = new dev.pumpwatch.common.Features(1, at(n, 0), at(n, 1), "GME", at(n - 5, 0), at(n, 0), 5, f, null);
            var swing = scorer.swing(features);
            if (n == 30) {
                assertThat(f).doesNotContainKeys("rv30", "rvd_est");
                assertThat(swing).isNull();
            } else if (n < 391) {
                assertThat(f).containsKey("rvd_est").doesNotContainKey("rvd");
                assertThat(swing.median()).isPositive();
                assertThat(swing.upperBand()).isGreaterThanOrEqualTo(swing.median());
            } else {
                assertThat(f).containsKey("rvd").doesNotContainKey("rvd_est");
                assertThat(swing.median()).isPositive();
            }
        }
    }

    /**
     * Whole pipeline: the swing is null without a day of bars and non-null with one. The 400 earlier bars are written
     * straight into the vol-bars store, because piping 391 minutes of ticks through the topology takes minutes.
     */
    @Test
    void swingIsNullWithoutHistoryAndNonNullWithIt() {
        assertThat(lastScore(false).swing()).isNull();
        Score s = lastScore(true);
        assertThat(s.swing()).isNotNull();
        assertThat(s.swing().median()).isFinite();
        assertThat(s.swing().upperBand()).isGreaterThanOrEqualTo(s.swing().median());
    }

    private static Score lastScore(boolean history) {
        PipelineProperties props = new PipelineProperties(List.of("GME"), 5, 0.1, 60, Duration.ofMinutes(30), 50,
                Duration.ofHours(1), "rules", Duration.ofMinutes(5), "", "", List.of(5));
        StreamsBuilder b = new StreamsBuilder();
        PipelineApplication.build(b, props, VolatilityScorer.orBaseline("").on(new RuleScorer()), List.of(5));
        try (var d = Fx.driver(b.build())) {
            if (history) {
                Bars bars = Bars.EMPTY;
                for (int m = -400; m < 0; m++) {
                    bars = bars.add(Agg.trade(at(m, 0).toEpochMilli(), 10 + 0.05 * Math.floorMod(m, 5), 100));
                }
                KeyValueStore<String, String> store = d.getKeyValueStore("vol-bars");
                store.put("GME", Json.toJson(bars));
            }
            var ticks = d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer());
            for (int m = 0; m < 14; m += 2) {
                ticks.pipeInput("GME", Fx.tick(at(m, 0), "GME", String.valueOf(10 + 0.05 * (m % 5)), 100));
            }
            List<Score> scores = d.createOutputTopic(Topics.SCORES, Serdes.String().deserializer(),
                    Serdes.String().deserializer()).readValuesToList().stream()
                    .map(v -> Json.fromJson(v, Score.class)).toList();
            assertThat(scores).isNotEmpty();
            return scores.get(scores.size() - 1);
        }
    }
}
