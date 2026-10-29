package dev.pumpwatch.pipeline.flagger;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.Fx;
import dev.pumpwatch.pipeline.scorer.RuleScorer;
import dev.pumpwatch.pipeline.scorer.Scorer;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.Topology;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FlagStageTest {
    static final FlagConfig CFG = new FlagConfig(5, 60, Duration.ofMinutes(30), 10, Duration.ofHours(1));
    /** Scores a window as the "s" value in its features, so tests pick scores directly. */
    static final Scorer STUB = new RuleScorer() {
        @Override
        public Score score(Features f) {
            return new Score(1, f.eventTime(), f.eventTime(), f.ticker(), f.windowEnd(), f.values().getOrDefault("s", 0.0),
                    "rules-v1", null);
        }

        @Override
        public List<Flag.Contributor> contributors(Features f) {
            return List.of(new Flag.Contributor("social", 40), new Flag.Contributor("market", 20));
        }
    };
    Topology topology;
    TopologyTestDriver d;
    TestInputTopic<String, String> features;
    TestInputTopic<String, String> scores;
    TestOutputTopic<String, String> flags;

    @BeforeEach
    void setUp() {
        StreamsBuilder b = new StreamsBuilder();
        FlagStage.build(b, STUB, CFG);
        topology = b.build();
        d = Fx.driver(topology);
        features = d.createInputTopic(Topics.FEATURES, Serdes.String().serializer(), Serdes.String().serializer());
        scores = d.createInputTopic(Topics.SCORES, Serdes.String().serializer(), Serdes.String().serializer());
        flags = d.createOutputTopic(Topics.FLAGS, Serdes.String().deserializer(), Serdes.String().deserializer());
    }

    @AfterEach
    void tearDown() {
        d.close();
    }

    /** One 5 minute window ending at {@code end}: its features, then its score. */
    void window(Instant end, double score, int windowMinutes) {
        Features f = new Features(1, end, end, "GME", end.minusSeconds(windowMinutes * 60L), end, windowMinutes,
                Map.of("mentions", 40.0, "trades", 12.0, "s", score), null);
        features.pipeInput("GME", Json.toJson(f));
        scores.pipeInput("GME", Json.toJson(new Score(SchemaVersions.SCORE, end, end, "GME", end, score, "rules-v1", null)));
    }

    void window(Instant end, double score) {
        window(end, score, 5);
    }

    List<Flag> flags() {
        return flags.readValuesToList().stream().map(v -> Json.fromJson(v, Flag.class)).toList();
    }

    @Test
    void belowTheFlagLevelEmitsNothing() {
        window(at(10, 0), 59.9);
        assertThat(flags()).isEmpty();
    }

    @Test
    void crossingEmitsOneFlagWithEvidence() {
        window(at(10, 0), 72);
        List<Flag> out = flags();
        assertThat(out).hasSize(1);
        Flag f = out.get(0);
        assertThat(Validator.validate(f)).isEmpty();
        assertThat(f.ticker()).isEqualTo("GME");
        assertThat(f.raisedAt()).isEqualTo(at(10, 0));
        assertThat(f.evidence().score()).isEqualTo(72);
        assertThat(f.evidence().modelVersion()).isEqualTo("rules-v1");
        assertThat(f.evidence().postCount()).isEqualTo(40);
        assertThat(f.evidence().tradeCount()).isEqualTo(12);
        assertThat(f.evidence().topContributors()).extracting(Flag.Contributor::featureGroup)
                .containsExactly("social", "market");
        assertThat(f.evidence().catalyst().found()).isFalse();
        assertThat(f.evidence().catalyst().lookbackStart()).isEqualTo(at(10, 0).minus(Duration.ofHours(1)));
        assertThat(f.evidence().catalyst().lookbackEnd()).isEqualTo(at(10, 0));
    }

    @Test
    void featuresVersionThatDidNotProduceTheScoreIsNotUsedAsEvidence() {
        Instant end = at(10, 0);
        Features stale = new Features(1, end, end, "GME", end.minusSeconds(300), end, 5,
                Map.of("mentions", 1.0, "trades", 0.0, "s", 10.0), null);
        features.pipeInput("GME", Json.toJson(stale)); // an earlier, partial version of the same window
        window(end, 70);
        assertThat(flags()).hasSize(1).first().satisfies(f -> assertThat(f.evidence().postCount()).isEqualTo(40));
    }

    @Test
    void otherWindowLengthsDoNotFlag() {
        window(at(10, 0), 90, 1);
        assertThat(flags()).isEmpty();
    }

    @Test
    void cooldownSuppressesRepeatsUntilItEnds() {
        window(at(10, 0), 70);
        window(at(10, 15), 70);
        window(at(39, 45), 70); // 29:45 after the first flag
        assertThat(flags()).hasSize(1);
        window(at(40, 0), 70); // exactly the cooldown
        assertThat(flags()).hasSize(1).first().satisfies(f -> assertThat(f.raisedAt()).isEqualTo(at(40, 0)));
    }

    @Test
    void reflagInsideCooldownNeedsTheMargin() {
        window(at(10, 0), 65);
        window(at(11, 0), 74.9); // +9.9: not enough
        assertThat(flags()).hasSize(1);
        window(at(12, 0), 75); // +10 over the last flag
        assertThat(flags()).hasSize(1).first().satisfies(f -> assertThat(f.evidence().score()).isEqualTo(75));
        window(at(13, 0), 84); // measured against the 75 flag now, +9
        assertThat(flags()).isEmpty();
    }

    @Test
    void dedupStateIsInAPersistentChangelogBackedStore() {
        window(at(10, 0), 70);
        assertThat(d.getKeyValueStore("flag-state").persistent()).isTrue();
        assertThat(d.producedTopicNames()).contains("test-flag-state-changelog");
    }
}
