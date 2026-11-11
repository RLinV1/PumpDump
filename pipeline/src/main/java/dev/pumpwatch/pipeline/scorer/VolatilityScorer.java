package dev.pumpwatch.pipeline.scorer;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Swing;
import dev.pumpwatch.common.Swing.Regime;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Next-hour swing forecast. A vol model directory (written by {@code python -m pumpml vol-train}) holds median.onnx and
 * upper.onnx (raw LightGBM boosters, log of high/low), model.json (feature order, {@code coverage_shift}, and the
 * HAR-RV baseline) and reference.json (one input and the expected log-space median and corrected band). The band
 * correction is applied here: {@code max(max(upper, median) + shift, median)}.
 *
 * <p>{@link #orBaseline} never throws: if the directory is absent, corrupt or fails the self-check it serves the HAR-RV
 * baseline (coefficients from model.json when readable, else {@link #DEFAULT_HAR}). Without {@code rvd} (no one-day
 * realised volatility, which needs 391 one-minute bars; the pipeline's {@code Bars} computes the inputs as vol.py does) there is no forecast and the swing is null, which is the spec's "not enough history".
 */
public final class VolatilityScorer implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(VolatilityScorer.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Self-check tolerance on the log range; float32 vs float64 differences are ~1e-6. */
    public static final double TOLERANCE = 1e-4;
    public static final List<String> FEATURES = List.of("rv5", "rv30", "rvd", "vol_ratio", "tod", "gap");
    /**
     * Default HAR-RV when no fitted coefficients exist: [intercept, rv5, rv30, rvd] on the log range. Expected range of a
     * Brownian path over an hour is sqrt(8/pi) * sigma_hour, and sigma_hour = rvd * sqrt(60/390). Band: x1.5, see {@link #DEFAULT_BAND_SHIFT}.
     */
    public static final double[] DEFAULT_HAR = {0, 0, 0, Math.sqrt(8 / Math.PI) * Math.sqrt(60.0 / 390)};
    /** NaN stands for "no fitted shift": the default band is the median x {@link #DEFAULT_BAND_FACTOR}. */
    public static final double DEFAULT_BAND_SHIFT = Double.NaN, DEFAULT_BAND_FACTOR = 1.5;
    /** Regime cut-offs in units of sigma_hour: Brownian range p50 (~1.5) and p90 (~2.3). See design.md. */
    public static final double CALM_BELOW = 1.5, EXTREME_FROM = 2.3;
    private static final ZoneId EXCHANGE = ZoneId.of("America/New_York");

    private final String version;
    private final List<String> features;
    private final double shift;
    private final double[] har;
    private final double harBand;
    private final OrtEnvironment env;
    private final OrtSession median, upper; // null for the baseline

    private VolatilityScorer(String version, List<String> features, double shift, double[] har, double harBand,
                             OrtEnvironment env, OrtSession median, OrtSession upper) {
        this.version = version;
        this.features = features;
        this.shift = shift;
        this.har = har;
        this.harBand = harBand;
        this.env = env;
        this.median = median;
        this.upper = upper;
    }

    /** The model in {@code dir}, or the HAR-RV baseline (logged once at WARN with the reason) if it cannot be served. */
    public static VolatilityScorer orBaseline(String dir) {
        if (dir == null || dir.isBlank()) return baseline("har-default", DEFAULT_HAR, DEFAULT_BAND_SHIFT);
        try {
            VolatilityScorer s = load(Path.of(dir));
            log.info("Serving ONNX volatility model {}", s.version);
            return s;
        } catch (Exception | LinkageError e) {
            log.warn("Volatility model in '{}' not served, falling back to the HAR-RV baseline: {}", dir, e.toString());
            try {
                JsonNode info = JSON.readTree(Files.readAllBytes(Path.of(dir, "model.json")));
                return baseline("har-" + Path.of(dir).toAbsolutePath().getFileName(), doubles(info.get("har_coef")),
                        info.get("har_band_shift").asDouble());
            } catch (Exception | LinkageError ignored) {
                return baseline("har-default", DEFAULT_HAR, DEFAULT_BAND_SHIFT);
            }
        }
    }

    private static VolatilityScorer baseline(String version, double[] har, double band) {
        if (har.length != 4) throw new IllegalStateException("bad har_coef");
        return new VolatilityScorer(version, FEATURES, 0, har, band, null, null, null);
    }

    public static VolatilityScorer load(Path dir) throws Exception {
        JsonNode info = JSON.readTree(Files.readAllBytes(dir.resolve("model.json")));
        List<String> features = new ArrayList<>();
        info.get("features").forEach(n -> features.add(n.asText()));
        if (features.isEmpty()) throw new IllegalStateException("bad model.json");

        OrtEnvironment env = OrtEnvironment.getEnvironment();
        OrtSession med = env.createSession(dir.resolve("median.onnx").toString(), new OrtSession.SessionOptions());
        OrtSession up = null;
        try {
            up = env.createSession(dir.resolve("upper.onnx").toString(), new OrtSession.SessionOptions());
            VolatilityScorer s = new VolatilityScorer("onnx-" + dir.toAbsolutePath().getFileName(), features,
                    info.get("coverage_shift").asDouble(), doubles(info.get("har_coef")),
                    info.get("har_band_shift").asDouble(), env, med, up);
            JsonNode ref = JSON.readTree(Files.readAllBytes(dir.resolve("reference.json")));
            double[] row = new double[features.size()];
            for (int i = 0; i < row.length; i++) row[i] = ref.get("features").get(features.get(i)).asDouble();
            double[] got = s.forecast(row);
            double em = ref.get("expected_median").asDouble(), eu = ref.get("expected_upper").asDouble();
            if (!(Math.abs(got[0] - em) <= TOLERANCE && Math.abs(got[1] - eu) <= TOLERANCE)) {
                throw new IllegalStateException("self-check failed: reference forecasts " + got[0] + " / " + got[1]
                        + ", expected " + em + " / " + eu);
            }
            return s;
        } catch (Exception e) {
            med.close();
            if (up != null) up.close();
            throw e;
        }
    }

    public String modelVersion() {
        return version;
    }

    /** The forecast as percent of price, or null without the one-day realised volatility (insufficient history). */
    public Swing swing(Features f) {
        Map<String, Double> v = f.values();
        double rvd = v.getOrDefault("rvd", 0.0);
        if (!(rvd > 0)) return null;
        double[] row = new double[features.size()];
        for (int i = 0; i < row.length; i++) row[i] = input(f, features.get(i));
        double[] fc = forecast(row);
        return new Swing(pct(fc[0]), pct(fc[1]), regime(fc[0], rvd));
    }

    /** Median vs the Brownian range distribution at the day's volatility; per-ticker history replaces this later. */
    public static Regime regime(double medianLogRange, double rvd) {
        double ratio = medianLogRange / (rvd * Math.sqrt(60.0 / 390));
        return ratio < CALM_BELOW ? Regime.CALM : ratio < EXTREME_FROM ? Regime.ELEVATED : Regime.EXTREME;
    }

    /** Adds the swing to the pump scorer's scores; the pump score, version and contributors are unchanged. */
    public Scorer on(Scorer pump) {
        return new Scorer() {
            @Override
            public String modelVersion() {
                return pump.modelVersion();
            }

            @Override
            public Score score(Features f) {
                Score s = pump.score(f);
                return new Score(s.schemaVersion(), s.eventTime(), s.ingestTime(), s.ticker(), s.windowEnd(), s.score(),
                        s.modelVersion(), s.staleSources(), swing(f));
            }

            @Override
            public List<Flag.Contributor> contributors(Features f) {
                return pump.contributors(f);
            }
        };
    }

    private static double input(Features f, String name) {
        if ("tod".equals(name) && !f.values().containsKey(name)) { // live features carry the latest bar's minute
            var t = f.windowEnd().atZone(EXCHANGE);
            return t.getHour() * 60 + t.getMinute();
        }
        Double d = f.values().get(name);
        return d == null ? 0.0 : d; // missing reads as 0, like the pump scorer
    }

    /** {median, upper band} as log(high/low), the unit of the target, the boosters and the HAR fit. */
    private double[] forecast(double[] row) {
        if (median == null) {
            double h = har[0];
            for (int i = 0; i < 3; i++) h += har[i + 1] * row[features.indexOf(FEATURES.get(i))];
            double m = Math.max(h, 1e-6); // vol.py HarRV.predict
            return new double[] {m, Double.isNaN(harBand) ? m * DEFAULT_BAND_FACTOR : Math.max(m + harBand, m)};
        }
        double m = run(median, row), u = run(upper, row);
        return new double[] {m, Math.max(Math.max(u, m) + shift, m)};
    }

    private double run(OrtSession s, double[] row) {
        float[][] in = {new float[row.length]};
        for (int i = 0; i < row.length; i++) in[0][i] = (float) row[i];
        try (OnnxTensor t = OnnxTensor.createTensor(env, in);
             OrtSession.Result r = s.run(Map.of(s.getInputNames().iterator().next(), t))) {
            return ((float[][]) r.get(0).getValue())[0][0];
        } catch (Exception e) {
            throw new IllegalStateException("model run failed", e);
        }
    }

    private static double pct(double logRange) {
        return 100 * Math.expm1(logRange);
    }

    private static double[] doubles(JsonNode a) {
        double[] out = new double[a.size()];
        for (int i = 0; i < out.length; i++) out[i] = a.get(i).asDouble();
        return out;
    }

    @Override
    public void close() throws Exception {
        if (median != null) {
            median.close();
            upper.close();
        }
    }
}
