package dev.pumpwatch.pipeline.flagger;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.EventTime;
import dev.pumpwatch.pipeline.scorer.Scorer;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.JoinWindows;
import org.apache.kafka.streams.kstream.Produced;
import org.apache.kafka.streams.kstream.StreamJoined;
import org.apache.kafka.streams.processor.api.Processor;
import org.apache.kafka.streams.processor.api.ProcessorContext;
import org.apache.kafka.streams.processor.api.Record;
import org.apache.kafka.streams.state.KeyValueStore;
import org.apache.kafka.streams.state.Stores;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * scores + features to flags. A score is paired with the features of the same window (same ticker, same window end)
 * to fill in the evidence. Cooldown and re-flag margin run in event time against the last flag per ticker, which lives
 * in a persistent, changelog-backed store so it survives a restart.
 */
public final class FlagStage {
    public static final String STORE = "flag-state";
    private static final Logger log = LoggerFactory.getLogger(FlagStage.class);

    private FlagStage() {}

    record Last(long atMs, double score) {}

    record Pair(Score score, Features features) {}

    public static void build(StreamsBuilder b, Scorer scorer, FlagConfig cfg) {
        build(b, scorer, cfg, new SimpleMeterRegistry());
    }

    /** {@code meters} receives {@code pumpwatch.flag.latency}: wall time from the scored window end to the flag. */
    public static void build(StreamsBuilder b, Scorer scorer, FlagConfig cfg, MeterRegistry meters) {
        Timer latency = Timer.builder("pumpwatch.flag.latency").publishPercentileHistogram().register(meters);
        Consumed<String, String> consumed =
                Consumed.with(Serdes.String(), Serdes.String()).withTimestampExtractor(new EventTime());
        var scores = b.stream(Topics.SCORES, consumed);
        var features = b.stream(Topics.FEATURES, consumed)
                .filter((k, v) -> windowMinutes(v) == cfg.windowMinutes());
        b.addStateStore(Stores.keyValueStoreBuilder(Stores.persistentKeyValueStore(STORE), Serdes.String(), Serdes.String())
                .withLoggingEnabled(Map.of()));

        scores.join(features, FlagStage::pair, JoinWindows.ofTimeDifferenceAndGrace(Duration.ofSeconds(1), Duration.ofMinutes(2)),
                        StreamJoined.with(Serdes.String(), Serdes.String(), Serdes.String()))
                .filter((k, p) -> p != null)
                .process(() -> new Dedup(scorer, cfg, latency), STORE)
                .mapValues(Json::toJson)
                .to(Topics.FLAGS, Produced.with(Serdes.String(), Serdes.String()));
    }

    private static int windowMinutes(String featuresJson) {
        try {
            return Json.fromJson(featuresJson, Features.class).windowMinutes();
        } catch (RuntimeException e) {
            log.warn("dropping unreadable features: {}", e.getMessage());
            return -1;
        }
    }

    private static Pair pair(String scoreJson, String featuresJson) {
        try {
            return new Pair(Json.fromJson(scoreJson, Score.class), Json.fromJson(featuresJson, Features.class));
        } catch (RuntimeException e) {
            log.warn("dropping unreadable score/features pair: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Found when the newest catalyst (filing or news item) is no older than the lookback. The items are the 8-K item
     * codes the window's features carry (their lookback is 24 hours, so they can be older than the check window).
     */
    static Flag.CatalystCheck catalyst(Features f, Instant at, Duration lookback) {
        double since = f.values().getOrDefault("minutesSinceCatalyst", Double.MAX_VALUE);
        boolean found = since <= lookback.toMinutes();
        List<String> items = !found ? List.of() : f.values().keySet().stream().filter(k -> k.startsWith("item."))
                .map(k -> k.substring("item.".length())).sorted().toList();
        return new Flag.CatalystCheck(found, at.minus(lookback), at, items);
    }

    private static final class Dedup implements Processor<String, Pair, String, Flag> {
        private final Scorer scorer;
        private final FlagConfig cfg;
        private ProcessorContext<String, Flag> ctx;
        private KeyValueStore<String, String> store;

        private final Timer latency;

        Dedup(Scorer scorer, FlagConfig cfg, Timer latency) {
            this.scorer = scorer;
            this.cfg = cfg;
            this.latency = latency;
        }

        @Override
        public void init(ProcessorContext<String, Flag> context) {
            this.ctx = context;
            this.store = context.getStateStore(STORE);
        }

        @Override
        public void process(Record<String, Pair> rec) {
            Score s = rec.value().score();
            Features f = rec.value().features();
            if (s.score() < cfg.level()) return;
            // The join pairs a score with every emitted version of its window's features; only the version that
            // produced this score is valid evidence, and a deterministic scorer identifies it by reproducing the score.
            if (Math.abs(scorer.score(f).score() - s.score()) > 1e-9) return;
            String prev = store.get(s.ticker());
            if (prev != null) {
                Last last = Json.fromJson(prev, Last.class);
                boolean cooling = s.eventTime().toEpochMilli() - last.atMs() < cfg.cooldown().toMillis();
                if (cooling && s.score() < last.score() + cfg.reflagMargin()) return;
            }
            store.put(s.ticker(), Json.toJson(new Last(s.eventTime().toEpochMilli(), s.score())));
            Instant at = s.eventTime();
            Flag.Evidence evidence = new Flag.Evidence(s.score(), s.modelVersion(), scorer.contributors(f),
                    Math.round(f.values().getOrDefault("mentions", 0.0)),
                    Math.round(f.values().getOrDefault("trades", 0.0)),
                    catalyst(f, at, cfg.catalystLookback()));
            Duration lag = Duration.between(at, Instant.now());
            if (!lag.isNegative()) latency.record(lag); // negative only when replaying timestamps from the future
            ctx.forward(rec.withValue(new Flag(SchemaVersions.FLAG, at, Instant.now(), s.ticker(), at, evidence))
                    .withTimestamp(at.toEpochMilli()));
        }
    }
}
