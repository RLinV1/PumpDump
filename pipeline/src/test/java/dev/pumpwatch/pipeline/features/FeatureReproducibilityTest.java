package dev.pumpwatch.pipeline.features;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.Fx;
import dev.pumpwatch.pipeline.extractor.Mention;
import dev.pumpwatch.pipeline.extractor.SimHash;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeMap;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Look-ahead and live-equals-replay. Separate from FeatureStageTest so no shared driver holds the state dir. */
class FeatureReproducibilityTest {
    static final Instant FAR = Instant.parse("2036-01-01T00:00:00Z");

    static String mentionJson(Instant when, String author, boolean fresh, String text) {
        return Json.toJson(new Mention(1, when, when, "GME", "reddit", "p" + when + author, author, fresh, SimHash.of(text)));
    }

    // ---- look-ahead and live-equals-replay: run whole record lists through fresh drivers ----

    record Rec(String topic, String key, String value, Instant ts) {}

    static Map<String, Map<String, Double>> run(List<Rec> recs) {
        StreamsBuilder b = new StreamsBuilder();
        FeatureStage.build(b, 1.0, List.of(1, 5), Set.of("GME"));
        try (TopologyTestDriver d = Fx.driver(b.build())) {
            for (Rec r : recs) {
                d.createInputTopic(r.topic(), Serdes.String().serializer(), Serdes.String().serializer())
                        .pipeInput(r.key(), r.value(), FAR);
            }
            Map<String, Map<String, Double>> byWindow = new TreeMap<>();
            for (String v : d.createOutputTopic(Topics.FEATURES, Serdes.String().deserializer(), Serdes.String().deserializer())
                    .readValuesToList()) {
                Features f = Json.fromJson(v, Features.class);
                if (f.ticker().equals("GME")) byWindow.put(f.windowMinutes() + "@" + f.windowEnd(), f.values());
            }
            return byWindow;
        }
    }

    static Rec closer() {
        return new Rec(Topics.TICKS, "CLS", Fx.tick(at(400, 0), "CLS", "1.00", 1), at(400, 0));
    }

    @Test
    void aFutureRecordNeverChangesAPastWindow() {
        List<Rec> base = new ArrayList<>(List.of(
                new Rec(Topics.MENTIONS, "GME", mentionJson(at(62, 0), "a1", true, "t"), at(62, 0)),
                new Rec(Topics.TICKS, "GME", Fx.tick(at(62, 10), "GME", "10.00", 100), at(62, 10)),
                new Rec(Topics.TICKS, "GME", Fx.tick(at(62, 40), "GME", "11.00", 100), at(62, 40)),
                new Rec(Topics.RAW_FILINGS, "x", Fx.filing(at(20, 0), "GME", "8-K", "2.02"), at(20, 0)),
                new Rec(Topics.RAW_NEWS, "x", Fx.news(at(65, 0), "reuters", "GME"), at(65, 0))));
        List<Rec> past = new ArrayList<>(base);
        past.add(closer());
        List<Rec> withFuture = new ArrayList<>(base);
        Instant t = at(70, 0); // windows ending at or before here must not see anything after it
        withFuture.add(new Rec(Topics.MENTIONS, "GME", mentionJson(t.plusSeconds(10), "a9", false, "u"), t));
        withFuture.add(new Rec(Topics.TICKS, "GME", Fx.tick(t.plusSeconds(20), "GME", "50.00", 99999), t));
        withFuture.add(new Rec(Topics.RAW_FILINGS, "x", Fx.filing(t.plusSeconds(30), "GME", "8-K", "1.01"), t));
        withFuture.add(new Rec(Topics.RAW_NEWS, "x", Fx.news(t.plusSeconds(40), "ap", "GME"), t));
        withFuture.add(closer());

        Map<String, Map<String, Double>> a = run(past), b = run(withFuture);
        Instant limit = t;
        Map<String, Map<String, Double>> aPast = new TreeMap<>(), bPast = new TreeMap<>();
        a.forEach((k, v) -> { if (!Instant.parse(k.substring(k.indexOf('@') + 1)).isAfter(limit)) aPast.put(k, v); });
        b.forEach((k, v) -> { if (!Instant.parse(k.substring(k.indexOf('@') + 1)).isAfter(limit)) bPast.put(k, v); });
        assertThat(aPast).isNotEmpty().isEqualTo(bPast);
        assertThat(b.size()).isGreaterThan(bPast.size()); // the future records did create later windows
    }

    @Test
    void liveFeaturesEqualReplayFeaturesOverARecordedHour() {
        Random rnd = new Random(42);
        List<Rec> tape = new ArrayList<>();
        for (int sec = 0; sec < 7200; sec += 20) { // hour 0 is history for the baseline, hour 1 is the recorded hour
            Instant ts = at(0, 0).plusSeconds(sec + rnd.nextInt(20));
            if (sec % 40 == 0) {
                String text = rnd.nextInt(3) == 0 ? "buy GME now buy now" : "random chatter " + rnd.nextInt(1000);
                tape.add(new Rec(Topics.MENTIONS, "GME", mentionJson(ts, "u" + rnd.nextInt(15), rnd.nextBoolean(), text), ts));
            }
            double price = 10 + rnd.nextInt(200) / 100.0;
            tape.add(new Rec(Topics.TICKS, "GME", Fx.tick(ts, "GME", String.format("%.3f", price), 1 + rnd.nextInt(500)), ts));
        }
        for (int m : new int[] {70, 85, 100}) {
            Instant ts = at(m, 0);
            tape.add(new Rec(Topics.RAW_FILINGS, "x", Fx.filing(ts, "GME", "8-K", "2.02", "9.01"), ts));
            tape.add(new Rec(Topics.RAW_NEWS, "x", Fx.news(ts.plusSeconds(90), "outlet" + m % 3, "GME"), ts.plusSeconds(90)));
        }
        // replay: the recorder returns records in event-time order
        List<Rec> replay = new ArrayList<>(tape);
        replay.sort(Comparator.comparing(Rec::ts));
        replay.add(closer());
        // live: each record arrives up to 60 s after it happened, so order differs but stays inside the grace
        List<Rec> live = new ArrayList<>(tape);
        Map<Rec, Long> delay = new java.util.IdentityHashMap<>();
        live.forEach(r -> delay.put(r, (long) rnd.nextInt(60)));
        live.sort(Comparator.comparing((Rec r) -> r.ts().plusSeconds(delay.get(r))));
        live.add(closer());

        Map<String, Map<String, Double>> fromReplay = run(replay), fromLive = run(live);
        assertThat(fromReplay.size()).isGreaterThan(400);
        assertThat(fromReplay.values()).anySatisfy(v -> assertThat(v.get("filings24h")).isPositive());
        assertThat(fromReplay.values()).anySatisfy(v -> assertThat(v.get("duplicateShare")).isPositive());
        assertThat(fromReplay.values()).anySatisfy(v -> assertThat(v.get("volumeRatio")).isNotEqualTo(1.0));
        assertThat(fromLive).isEqualTo(fromReplay);
    }
}
