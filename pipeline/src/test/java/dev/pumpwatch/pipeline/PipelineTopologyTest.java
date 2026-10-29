package dev.pumpwatch.pipeline;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.scorer.RuleScorer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.Test;

/** All four stages wired as in the app, driven only through raw-posts and ticks. Only the 5 minute window is built: the 1 and 30 minute stores make each test record cost seconds on a slow disk. */
class PipelineTopologyTest {
    // margin 50 can never be met (scores top out at 100), so only the first crossing may flag
    static final PipelineProperties PROPS =
            new PipelineProperties(List.of("GME"), 5, 0.1, 60, Duration.ofMinutes(30), 50, Duration.ofHours(1), "rules", Duration.ofMinutes(5));

    record Ev(String topic, String value) {}

    @Test
    void aQuietTapeWithOneBurstProducesExactlyOneFlag() {
        // sorted by event time so the stream clock only moves forward
        TreeMap<Instant, List<Ev>> tape = new TreeMap<>();
        for (int m : new int[] {0, 3, 6, 9}) { // quiet trades at 10.00
            tape.computeIfAbsent(at(m, 0), k -> new ArrayList<>()).add(new Ev(Topics.TICKS, Fx.tick(at(m, 0), "GME", "10.00", 100)));
        }
        for (int m = 13; m <= 40; m += 3) { // quiet again at 12.00 after the burst
            tape.computeIfAbsent(at(m, 0), k -> new ArrayList<>()).add(new Ev(Topics.TICKS, Fx.tick(at(m, 0), "GME", "12.00", 100)));
        }
        for (int i = 0; i < 8; i++) { // 8 posts from 8 authors in under a minute
            Instant t = at(10, 0).plusSeconds(i * 7L);
            tape.computeIfAbsent(t, k -> new ArrayList<>())
                    .add(new Ev(Topics.RAW_POSTS, Fx.post(t, "user" + i, "$GME to the moon")));
        }
        String[] prices = {"10.00", "10.60", "11.40", "12.00"};
        for (int i = 0; i < 4; i++) { // 4 heavy trades, 10.00 climbing to 12.00
            Instant t = at(10, 5).plusSeconds(i * 15L);
            tape.computeIfAbsent(t, k -> new ArrayList<>()).add(new Ev(Topics.TICKS, Fx.tick(t, "GME", prices[i], 30_000)));
        }

        StreamsBuilder b = new StreamsBuilder();
        PipelineApplication.build(b, PROPS, new RuleScorer(), List.of(5));
        try (TopologyTestDriver d = Fx.driver(b.build())) {
            Map<String, TestInputTopic<String, String>> in = Map.of(
                    Topics.RAW_POSTS, d.createInputTopic(Topics.RAW_POSTS, Serdes.String().serializer(), Serdes.String().serializer()),
                    Topics.TICKS, d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer()));
            tape.values().forEach(evs -> evs.forEach(e -> in.get(e.topic()).pipeInput("GME", e.value())));

            TestOutputTopic<String, String> out = d.createOutputTopic(Topics.FLAGS,
                    Serdes.String().deserializer(), Serdes.String().deserializer());
            List<Flag> flags = out.readValuesToList().stream().map(v -> Json.fromJson(v, Flag.class)).toList();

            assertThat(flags).hasSize(1);
            Flag f = flags.get(0);
            assertThat(Validator.validate(f)).isEmpty();
            assertThat(f.ticker()).isEqualTo("GME");
            assertThat(f.evidence().score()).isGreaterThanOrEqualTo(60);
            assertThat(f.evidence().postCount()).isPositive();
            assertThat(f.evidence().tradeCount()).isPositive();
            assertThat(f.evidence().catalyst().found()).isFalse();
            assertThat(f.raisedAt()).isAfter(at(10, 0)).isBefore(at(18, 0));
        }
    }

    @Test
    void aQuietTapeProducesNoFlag() {
        StreamsBuilder b = new StreamsBuilder();
        PipelineApplication.build(b, PROPS, new RuleScorer(), List.of(5));
        try (TopologyTestDriver d = Fx.driver(b.build())) {
            var ticks = d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer());
            var posts = d.createInputTopic(Topics.RAW_POSTS, Serdes.String().serializer(), Serdes.String().serializer());
            for (int m = 0; m < 8; m++) {
                ticks.pipeInput("GME", Fx.tick(at(m * 2, 0), "GME", "10.00", 100));
                if (m % 4 == 0) posts.pipeInput("p" + m, Fx.post(at(m * 2, 1), "u" + m, "$GME hello"));
            }
            assertThat(d.createOutputTopic(Topics.FLAGS, Serdes.String().deserializer(), Serdes.String().deserializer())
                    .isEmpty()).isTrue();
        }
    }
}
