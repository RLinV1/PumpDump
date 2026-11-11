package dev.pumpwatch.pipeline.scorer;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Swing;
import dev.pumpwatch.common.Swing.Regime;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Uses the synthetic fixture in src/test/resources/onnx-model/vol-fixture-v1 (regenerate with make_vol_fixture.py). */
class VolatilityScorerTest {
    static final Path FIXTURE = Path.of("src/test/resources/onnx-model/vol-fixture-v1");
    static final ObjectMapper JSON = new ObjectMapper();
    static final Offset<Double> EPS = Offset.offset(1e-9);

    static JsonNode json(Path dir, String name) throws IOException {
        return JSON.readTree(dir.resolve(name).toFile());
    }

    /** The reference row as pipeline features at 14:00 UTC (reference tod is overridden by the window end). */
    static Features refFeatures() throws IOException {
        Map<String, Double> values = new HashMap<>();
        json(FIXTURE, "reference.json").get("features").fields().forEachRemaining(e -> values.put(e.getKey(), e.getValue().asDouble()));
        return new Features(1, at(10, 0), at(10, 1), "GME", at(9, 55), at(10, 0), 5, values, null);
    }

    static double pct(double log) {
        return 100 * Math.expm1(log);
    }

    @Test
    void servesTheModelAfterTheSelfCheck() throws Exception {
        VolatilityScorer s = VolatilityScorer.orBaseline(FIXTURE.toString());
        assertThat(s.modelVersion()).isEqualTo("onnx-vol-fixture-v1");
        JsonNode ref = json(FIXTURE, "reference.json");
        Features f = refFeatures();
        // load() already passed the self-check on the reference row; here tod comes from the window end instead
        Swing sw = s.swing(f);
        assertThat(sw.median()).isGreaterThan(0);
        assertThat(sw.upperBand()).isGreaterThanOrEqualTo(sw.median());
        assertThat(ref.get("expected_upper").asDouble()).isGreaterThanOrEqualTo(ref.get("expected_median").asDouble());
    }

    @Test
    void noRealisedDailyVolatilityMeansNoForecast() throws Exception {
        Features f = refFeatures();
        Map<String, Double> v = new HashMap<>(f.values());
        v.remove("rvd");
        Features none = new Features(1, f.eventTime(), f.ingestTime(), "GME", f.windowStart(), f.windowEnd(), 5, v, null);
        assertThat(VolatilityScorer.orBaseline(FIXTURE.toString()).swing(none)).isNull();
        assertThat(VolatilityScorer.orBaseline("").swing(none)).isNull();
    }

    @Test
    void noDirectoryServesTheDefaultBaseline() throws Exception {
        VolatilityScorer s = VolatilityScorer.orBaseline("");
        assertThat(s.modelVersion()).isEqualTo("har-default");
        Swing sw = s.swing(refFeatures());
        double median = VolatilityScorer.DEFAULT_HAR[3] * refFeatures().values().get("rvd");
        assertThat(sw.median()).isCloseTo(pct(Math.log(median)), EPS);
        assertThat(sw.upperBand()).isCloseTo(pct(Math.log(median) + VolatilityScorer.DEFAULT_BAND_SHIFT), EPS);
    }

    @Test
    void missingOrEmptyDirectoryFallsBack(@TempDir Path dir) throws Exception {
        assertThat(VolatilityScorer.orBaseline(dir.resolve("nope").toString()).swing(refFeatures())).isNotNull();
        assertThat(VolatilityScorer.orBaseline(dir.toString()).modelVersion()).isEqualTo("har-default");
    }

    @Test
    void corruptedModelFallsBackToTheFittedBaseline(@TempDir Path dir) throws Exception {
        copyFixture(dir);
        Files.write(dir.resolve("upper.onnx"), new byte[] {1, 2, 3, 4, 5});
        assertFittedBaseline(dir);
    }

    @Test
    void failedSelfCheckRefusesToServeAndFallsBack(@TempDir Path dir) throws Exception {
        copyFixture(dir);
        Files.writeString(dir.resolve("reference.json"),
                Files.readString(dir.resolve("reference.json")).replace("\"expected_median\": ", "\"expected_median\": 1"));
        assertThatThrownBy(() -> VolatilityScorer.load(dir)).hasMessageContaining("self-check failed");
        assertFittedBaseline(dir);
    }

    private static void assertFittedBaseline(Path dir) throws IOException {
        VolatilityScorer s = VolatilityScorer.orBaseline(dir.toString());
        assertThat(s.modelVersion()).startsWith("har-").isNotEqualTo("har-default");
        JsonNode info = json(dir, "model.json");
        Features f = refFeatures();
        double h = info.get("har_coef").get(0).asDouble();
        String[] cols = {"rv5", "rv30", "rvd"};
        for (int i = 0; i < 3; i++) h += info.get("har_coef").get(i + 1).asDouble() * f.values().get(cols[i]);
        double m = Math.log(Math.max(h, 1e-6));
        Swing sw = s.swing(f);
        assertThat(sw.median()).isCloseTo(pct(m), EPS);
        assertThat(sw.upperBand()).isCloseTo(pct(m + info.get("har_band_shift").asDouble()), EPS);
    }

    @Test
    void regimeFollowsTheRangeAgainstTheDaysVolatility() {
        double rvd = 0.02, sigmaHour = rvd * Math.sqrt(60.0 / 390);
        assertThat(VolatilityScorer.regime(1.0 * sigmaHour, rvd)).isEqualTo(Regime.CALM);
        assertThat(VolatilityScorer.regime(1.5 * sigmaHour, rvd)).isEqualTo(Regime.ELEVATED);
        assertThat(VolatilityScorer.regime(2.0 * sigmaHour, rvd)).isEqualTo(Regime.ELEVATED);
        assertThat(VolatilityScorer.regime(2.3 * sigmaHour, rvd)).isEqualTo(Regime.EXTREME);
        // same forecast, different history: the calmer ticker's forecast is the more extreme one
        assertThat(VolatilityScorer.regime(0.03, 0.01)).isEqualTo(Regime.EXTREME);
        assertThat(VolatilityScorer.regime(0.03, 0.06)).isEqualTo(Regime.CALM);
    }

    @Test
    void wrapperAddsSwingAndKeepsThePumpScore() throws Exception {
        Features f = refFeatures();
        Scorer pump = new RuleScorer();
        Scorer wrapped = VolatilityScorer.orBaseline(FIXTURE.toString()).on(pump);
        var score = wrapped.score(f);
        assertThat(score.swing()).isNotNull();
        assertThat(score.score()).isEqualTo(pump.score(f).score());
        assertThat(score.modelVersion()).isEqualTo(RuleScorer.VERSION).isEqualTo(wrapped.modelVersion());
        assertThat(wrapped.contributors(f)).isEqualTo(pump.contributors(f));
    }

    private static void copyFixture(Path dir) throws IOException {
        for (String f : new String[] {"median.onnx", "upper.onnx", "model.json", "reference.json"}) {
            Files.copy(FIXTURE.resolve(f), dir.resolve(f));
        }
    }
}
