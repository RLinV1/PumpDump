package dev.pumpwatch.pipeline.scorer;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Score;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The trained pump model served through ONNX Runtime. A model directory (written by {@code python -m pumpml train})
 * holds model.onnx (the booster, raw probability), model.json (feature order and the isotonic calibration as a
 * piecewise-linear table) and reference.json (one input and its expected score). Calibration is applied here, with
 * the same linear interpolation and clipping as sklearn, because isotonic does not export to ONNX cleanly.
 * {@link #load} runs the self-check and throws if anything is wrong; {@link #orRules} turns that into the fallback.
 */
public final class OnnxScorer implements Scorer, AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(OnnxScorer.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Self-check tolerance on the 0-100 score; float32 vs float64 differences are ~1e-6. */
    public static final double TOLERANCE = 1e-3;

    private final String version;
    private final List<String> features;
    private final double[] calX, calY;
    private final OrtEnvironment env;
    private final OrtSession session;

    private OnnxScorer(String version, List<String> features, double[] calX, double[] calY, OrtEnvironment env,
                       OrtSession session) {
        this.version = version;
        this.features = features;
        this.calX = calX;
        this.calY = calY;
        this.env = env;
        this.session = session;
    }

    /** The model in {@code dir}, or the rule scorer (logged once at WARN with the reason) if it cannot be served. */
    public static Scorer orRules(String dir) {
        if (dir == null || dir.isBlank()) return new RuleScorer();
        try {
            OnnxScorer s = load(Path.of(dir));
            log.info("Serving ONNX pump model {}", s.version);
            return s;
        } catch (Exception | LinkageError e) { // LinkageError: native runtime missing on this platform
            log.warn("Pump model in '{}' not served, falling back to {}: {}", dir, RuleScorer.VERSION, e.toString());
            return new RuleScorer();
        }
    }

    public static OnnxScorer load(Path dir) throws Exception {
        JsonNode info = JSON.readTree(Files.readAllBytes(dir.resolve("model.json")));
        List<String> features = new ArrayList<>();
        info.get("features").forEach(n -> features.add(n.asText()));
        double[] x = doubles(info.get("calibration").get("x")), y = doubles(info.get("calibration").get("y"));
        if (features.isEmpty() || x.length == 0 || x.length != y.length) throw new IllegalStateException("bad model.json");

        OrtEnvironment env = OrtEnvironment.getEnvironment();
        OrtSession session = env.createSession(dir.resolve("model.onnx").toString(), new OrtSession.SessionOptions());
        OnnxScorer s = new OnnxScorer("onnx-" + dir.toAbsolutePath().getFileName(), features, x, y, env, session);
        try {
            JsonNode ref = JSON.readTree(Files.readAllBytes(dir.resolve("reference.json")));
            double expected = ref.get("expected_score").asDouble();
            double[] row = new double[features.size()];
            for (int i = 0; i < row.length; i++) row[i] = ref.get("features").get(features.get(i)).asDouble();
            double got = s.calibrated(row);
            if (!(Math.abs(got - expected) <= TOLERANCE)) {
                throw new IllegalStateException("self-check failed: reference scores " + got + ", expected " + expected);
            }
            return s;
        } catch (Exception e) {
            s.close();
            throw e;
        }
    }

    @Override
    public String modelVersion() {
        return version;
    }

    @Override
    public Score score(Features f) {
        Map<String, Double> v = f.values();
        double[] row = new double[features.size()];
        for (int i = 0; i < row.length; i++) row[i] = v.getOrDefault(features.get(i), 0.0);
        double total = Math.max(0.0, Math.min(100.0, calibrated(row)));
        return new Score(SchemaVersions.SCORE, f.eventTime(), Instant.now(), f.ticker(), f.windowEnd(), total, version,
                f.staleSources(), null);
    }

    private double calibrated(double[] row) {
        float[][] in = {new float[row.length]};
        for (int i = 0; i < row.length; i++) in[0][i] = (float) row[i];
        try (OnnxTensor t = OnnxTensor.createTensor(env, in);
             OrtSession.Result r = session.run(Map.of(session.getInputNames().iterator().next(), t),
                     java.util.Set.of("probabilities"))) {
            float[][] p = (float[][]) r.get(0).getValue();
            return 100 * interp(p[0][1]);
        } catch (Exception e) {
            throw new IllegalStateException("model run failed", e);
        }
    }

    /** Linear interpolation over the calibration table, clipped at both ends (sklearn out_of_bounds="clip"). */
    private double interp(double p) {
        if (p <= calX[0]) return calY[0];
        int last = calX.length - 1;
        if (p >= calX[last]) return calY[last];
        int i = Arrays.binarySearch(calX, p);
        if (i >= 0) return calY[i];
        int hi = -i - 1, lo = hi - 1;
        return calY[lo] + (calY[hi] - calY[lo]) * (p - calX[lo]) / (calX[hi] - calX[lo]);
    }

    private static double[] doubles(JsonNode a) {
        double[] out = new double[a.size()];
        for (int i = 0; i < out.length; i++) out[i] = a.get(i).asDouble();
        return out;
    }

    @Override
    public void close() throws Exception {
        session.close();
    }
}
