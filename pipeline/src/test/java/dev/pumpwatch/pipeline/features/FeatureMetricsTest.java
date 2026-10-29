package dev.pumpwatch.pipeline.features;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.Fx;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.Set;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Late-data counter and the anomaly history that FeatureStage adds as z.* features. */
class FeatureMetricsTest {
    SimpleMeterRegistry meters = new SimpleMeterRegistry();
    TopologyTestDriver d;
    TestInputTopic<String, String> ticks;
    TestOutputTopic<String, String> out;

    @BeforeEach
    void setUp() {
        StreamsBuilder b = new StreamsBuilder();
        FeatureStage.build(b, 1.0, List.of(1), Set.of("GME"), meters);
        d = Fx.driver(b.build());
        ticks = d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer());
        out = d.createOutputTopic(Topics.FEATURES, Serdes.String().deserializer(), Serdes.String().deserializer());
    }

    @AfterEach
    void tearDown() {
        d.close();
    }

    double late(String topic) {
        return meters.counter("pumpwatch.late.records", "topic", topic).count();
    }

    @Test
    void recordsBeyondTheLatenessBoundAreCountedPerTopic() {
        ticks.pipeInput("GME", Fx.tick(at(10, 0), "GME", "10.00", 5));
        ticks.pipeInput("GME", Fx.tick(at(8, 1), "GME", "10.00", 5)); // 1:59 behind: inside the bound
        assertThat(late(Topics.TICKS)).isZero();
        ticks.pipeInput("GME", Fx.tick(at(7, 59), "GME", "10.00", 5)); // 2:01 behind
        ticks.pipeInput("GME", Fx.tick(at(1, 0), "GME", "10.00", 5));
        assertThat(late(Topics.TICKS)).isEqualTo(2);
        assertThat(late(Topics.MENTIONS)).isZero();
    }

    @Test
    void zScoresAppearOnlyAfterEnoughHistoryAndFlagASurge() {
        for (int i = 0; i < 40 * 4; i++) ticks.pipeInput("GME", Fx.tick(at(0, 0).plusSeconds(15L * i), "GME", "10.00", 100));
        ticks.pipeInput("GME", Fx.tick(at(41, 0), "GME", "10.00", 100000)); // a volume spike
        ticks.pipeInput("CLS", Fx.tick(at(60, 0), "CLS", "1.00", 1)); // close every window of interest
        List<Features> all = out.readValuesToList().stream().map(v -> Json.fromJson(v, Features.class))
                .filter(f -> f.ticker().equals("GME")).toList();
        assertThat(all.get(0).values()).doesNotContainKey("z.volume");
        assertThat(all.stream().filter(f -> f.values().containsKey("z.volume")).count()).isPositive();
        assertThat(all.stream().filter(f -> f.values().containsKey("z.volume") && f.values().get("z.volume") >= 5).count())
                .isPositive();
        assertThat(all).allSatisfy(f -> assertThat(f.values().values()).allMatch(Double::isFinite));
        assertThat(d.getKeyValueStore(FeatureStage.ANOMALY_STORE).persistent()).isTrue();
        assertThat(d.producedTopicNames()).contains("test-" + FeatureStage.ANOMALY_STORE + "-changelog");
    }
}
