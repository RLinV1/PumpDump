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
import java.time.Instant;
import java.util.List;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FeatureStageTest {
    TopologyTestDriver d;
    TestInputTopic<String, String> mentions;
    TestInputTopic<String, String> ticks;
    TestOutputTopic<String, String> out;

    @BeforeEach
    void setUp() {
        StreamsBuilder b = new StreamsBuilder();
        FeatureStage.build(b, 2.0);
        d = Fx.driver(b.build());
        mentions = d.createInputTopic(Topics.MENTIONS, Serdes.String().serializer(), Serdes.String().serializer());
        ticks = d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer());
        out = d.createOutputTopic(Topics.FEATURES, Serdes.String().deserializer(), Serdes.String().deserializer());
    }

    @AfterEach
    void tearDown() {
        d.close();
    }

    /** Pipes with an arrival timestamp 10 years off, so only the payload eventTime can explain the windows. */
    void mention(Instant when, String author) {
        String json = Json.toJson(new Mention(1, when, when, "GME", "reddit", "p" + when + author, author));
        mentions.pipeInput("GME", json, Instant.parse("2036-01-01T00:00:00Z"));
    }

    void tick(Instant when, String price, long size) {
        ticks.pipeInput("GME", Fx.tick(when, "GME", price, size), Instant.parse("2036-01-01T00:00:00Z"));
    }

    /** Latest emitted value for a window, or null. */
    static Features latest(List<Features> all, int minutes, Instant end) {
        Features f = null;
        for (Features x : all) if (x.windowMinutes() == minutes && x.windowEnd().equals(end)) f = x;
        return f;
    }

    List<Features> drain() {
        return out.readValuesToList().stream().map(v -> Json.fromJson(v, Features.class)).toList();
    }

    @Test
    void windowsUseEventTimeAndCarryTheDocumentedValues() {
        mention(at(10, 5), "a1");
        mention(at(10, 20), "a2");
        mention(at(10, 25), "a1");
        tick(at(10, 10), "10.00", 100);
        tick(at(10, 40), "11.00", 300);
        List<Features> all = drain();

        Features w = latest(all, 1, at(11, 0)); // window [10:00, 11:00)
        assertThat(w).isNotNull();
        assertThat(w.windowStart()).isEqualTo(at(10, 0));
        assertThat(w.eventTime()).isEqualTo(w.windowEnd());
        assertThat(w.ticker()).isEqualTo("GME");
        assertThat(w.values()).containsEntry("mentions", 3.0).containsEntry("distinctAuthors", 2.0)
                .containsEntry("trades", 2.0).containsEntry("volume", 400.0);
        assertThat(w.values().get("return")).isCloseTo(0.1, within(1e-9));
        assertThat(w.values().get("mentionRatio")).isCloseTo(3.0 / (2.0 * 1), within(1e-9));
        assertThat(Validator.validate(w)).isEmpty();
        // 5 and 30 minute windows ending at 15:00 and 30:00 both cover the records
        assertThat(latest(all, 5, at(15, 0)).values()).containsEntry("mentions", 3.0);
        assertThat(latest(all, 30, at(30, 0)).values()).containsEntry("trades", 2.0);
        // nothing is placed in a window built from the arrival time (year 2036)
        assertThat(all).allSatisfy(f -> assertThat(f.windowEnd()).isBefore(Instant.parse("2027-01-01T00:00:00Z")));
    }

    @Test
    void hoppingWindowsAdvanceEveryFifteenSeconds() {
        mention(at(10, 5), "a1");
        List<Features> ones = drain().stream().filter(f -> f.windowMinutes() == 1).toList();
        assertThat(ones).hasSize(4);
        assertThat(ones).extracting(Features::windowStart)
                .containsExactlyInAnyOrder(at(9, 15), at(9, 30), at(9, 45), at(10, 0));
    }

    @Test
    void lateRecordWithinGraceIsIncluded() {
        mention(at(9, 0), "a1");
        mention(at(10, 0), "a2"); // stream time 10:00
        mention(at(8, 50), "a3"); // 70 s late, inside the 2 minute grace
        Features w = latest(drain(), 1, at(9, 30)); // [8:30, 9:30) holds 8:50 and 9:00
        assertThat(w.values()).containsEntry("mentions", 2.0).containsEntry("distinctAuthors", 2.0);
        assertThat(droppedRecords()).isZero();
    }

    @Test
    void lateRecordBeyondGraceCountsAMetricAndDoesNotChangeEmittedWindows() {
        mention(at(7, 0), "a1");
        mention(at(10, 0), "a2");
        drain();
        mention(at(7, 10), "late"); // 1-minute windows for 7:10 closed at 8:00 + 2 min = stream time 10:00
        List<Features> after = drain();
        assertThat(after).noneMatch(f -> f.windowMinutes() == 1);
        assertThat(droppedRecords()).isPositive();
    }

    private double droppedRecords() {
        return d.metrics().entrySet().stream().filter(e -> e.getKey().name().equals("dropped-records-total"))
                .mapToDouble(e -> ((Number) e.getValue().metricValue()).doubleValue()).sum();
    }
}
