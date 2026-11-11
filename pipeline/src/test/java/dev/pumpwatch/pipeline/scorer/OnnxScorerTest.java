package dev.pumpwatch.pipeline.scorer;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Features;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Uses the synthetic fixture in src/test/resources/onnx-model (regenerate with make_fixture.py). */
class OnnxScorerTest {
    static final Path FIXTURE = Path.of("src/test/resources/onnx-model/fixture-v1");

    static JsonNode ref() throws IOException {
        return new ObjectMapper().readTree(FIXTURE.resolve("reference.json").toFile());
    }

    static Features features(Map<String, Double> values) {
        return new Features(1, at(10, 0), at(10, 1), "GME", at(9, 55), at(10, 0), 5, values, null);
    }

    @Test
    void servesTheModelAfterTheSelfCheck() throws Exception {
        Map<String, Double> values = new HashMap<>();
        ref().get("features").fields().forEachRemaining(e -> values.put(e.getKey(), e.getValue().asDouble()));
        Scorer s = OnnxScorer.orRules(FIXTURE.toString());
        assertThat(s).isInstanceOf(OnnxScorer.class);
        var score = s.score(features(values));
        assertThat(score.score()).isCloseTo(ref().get("expected_score").asDouble(), Offset.offset(OnnxScorer.TOLERANCE));
        assertThat(score.modelVersion()).isEqualTo("onnx-fixture-v1").isEqualTo(s.modelVersion());
        assertThat(score.swing()).isNull();
        assertThat(s.score(features(Map.of())).score()).isBetween(0.0, 100.0); // missing features read as 0
    }

    @Test
    void noModelConfiguredServesRules() {
        assertThat(OnnxScorer.orRules("").modelVersion()).isEqualTo(RuleScorer.VERSION);
    }

    @Test
    void missingModelFallsBackToRules(@TempDir Path dir) {
        assertThat(OnnxScorer.orRules(dir.resolve("nope").toString()).modelVersion()).isEqualTo(RuleScorer.VERSION);
        assertThat(OnnxScorer.orRules(dir.toString()).modelVersion()).isEqualTo(RuleScorer.VERSION);
    }

    @Test
    void corruptedModelFallsBackToRules(@TempDir Path dir) throws IOException {
        copyFixture(dir);
        Files.write(dir.resolve("model.onnx"), new byte[] {1, 2, 3, 4, 5});
        assertThat(OnnxScorer.orRules(dir.toString()).modelVersion()).isEqualTo(RuleScorer.VERSION);
    }

    @Test
    void failedSelfCheckRefusesToServe(@TempDir Path dir) throws IOException {
        copyFixture(dir);
        Files.writeString(dir.resolve("reference.json"),
                Files.readString(dir.resolve("reference.json")).replace("\"expected_score\": ", "\"expected_score\": 1"));
        assertThatThrownBy(() -> OnnxScorer.load(dir)).hasMessageContaining("self-check failed");
        assertThat(OnnxScorer.orRules(dir.toString()).modelVersion()).isEqualTo(RuleScorer.VERSION);
    }

    private static void copyFixture(Path dir) throws IOException {
        for (String f : new String[] {"model.onnx", "model.json", "reference.json"}) {
            Files.copy(FIXTURE.resolve(f), dir.resolve(f));
        }
    }
}
