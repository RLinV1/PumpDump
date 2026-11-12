package dev.pumpwatch.pipeline.proof;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.PipelineApplication;
import dev.pumpwatch.pipeline.PipelineProperties;
import dev.pumpwatch.pipeline.proof.SyntheticDay.Ev;
import dev.pumpwatch.pipeline.scorer.RuleScorer;
import java.time.Duration;
import java.util.List;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.Test;

/** End-to-end proof on a generated synthetic day: real topology, rule scorer, only the 5 minute window built. */
class SystemProofTest {
    // margin 50 can never be met (scores top out at 100), so only the first crossing per ticker may flag
    static final PipelineProperties PROPS = new PipelineProperties(SyntheticDay.TICKERS, 5, 0.1, 60,
            Duration.ofMinutes(30), 50, Duration.ofHours(1), "rules", Duration.ofMinutes(5), "", "", List.of(5)); // no model dirs: rule scorer, baseline volatility

    record Out(List<Flag> flags, List<Score> scores) {}

    static Out replay(List<Ev> day) {
        return replay(day, new RuleScorer());
    }

    static Out replay(List<Ev> day, dev.pumpwatch.pipeline.scorer.Scorer scorer) {
        StreamsBuilder b = new StreamsBuilder();
        PipelineApplication.build(b, PROPS, scorer, List.of(5));
        java.util.Properties cfg = new java.util.Properties();
        cfg.put(StreamsConfig.APPLICATION_ID_CONFIG, "proof-" + java.util.UUID.randomUUID()); // own state dir
        cfg.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "dummy:1234");
        cfg.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.StringSerde.class);
        cfg.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.StringSerde.class);
        try (TopologyTestDriver d = new TopologyTestDriver(b.build(), cfg)) {
            for (Ev e : day) {
                d.createInputTopic(e.topic(), Serdes.String().serializer(), Serdes.String().serializer())
                        .pipeInput(e.key(), e.value());
            }
            var str = Serdes.String().deserializer();
            return new Out(
                    d.createOutputTopic(Topics.FLAGS, str, str).readValuesToList().stream().map(v -> Json.fromJson(v, Flag.class)).toList(),
                    d.createOutputTopic(Topics.SCORES, str, str).readValuesToList().stream().map(v -> Json.fromJson(v, Score.class)).toList());
        }
    }

    /** Flags without ingestTime, which is the wall clock at emission. */
    static List<Flag> comparable(List<Flag> flags) {
        return flags.stream().map(f -> new Flag(f.schemaVersion(), f.eventTime(), f.eventTime(), f.ticker(), f.raisedAt(), f.evidence())).toList();
    }

    private static Out first;

    /** The plain day is replayed once; the flag test and the parity test (as run A) share it. */
    static synchronized Out firstRun() {
        if (first == null) first = replay(SyntheticDay.generate());
        return first;
    }

    /** Scores without ingestTime, which is the wall clock at emission. */
    static List<Score> noClock(List<Score> scores) {
        return scores.stream().map(s -> new Score(s.schemaVersion(), s.eventTime(), s.eventTime(), s.ticker(), s.windowEnd(),
                s.score(), s.modelVersion(), s.staleSources(), s.swing())).toList();
    }

    @Test
    void theDayFlagsExactlyThePumpWithNoCatalyst() {
        List<Flag> flags = firstRun().flags();

        assertThat(flags).hasSize(1);
        Flag f = flags.get(0);
        assertThat(f.ticker()).isEqualTo(SyntheticDay.PUMP);
        assertThat(f.raisedAt()).isAfter(at(10, 0)).isBefore(at(20, 0));
        assertThat(f.evidence().score()).isGreaterThanOrEqualTo(60);
        assertThat(f.evidence().catalyst().found()).isFalse();
        assertThat(f.evidence().catalyst().lookbackEnd()).isEqualTo(f.raisedAt());
        assertThat(f.evidence().catalyst().items()).isEmpty();
    }

    @Test
    void replayingTheSameDayTwiceGivesIdenticalFlagsAndScores() {
        Out a = firstRun();
        Out b = replay(SyntheticDay.generate());

        assertThat(a.flags()).isNotEmpty();
        assertThat(comparable(b.flags())).isEqualTo(comparable(a.flags()));
        assertThat(noClock(b.scores())).isEqualTo(noClock(a.scores()));
    }

    @Test
    void socialOutageKeepsScoringAndMarksLaterScoresStale() {
        Out out = replay(SyntheticDay.withSocialOutage(SyntheticDay.generate(), at(25, 0)));

        // the outage starts at 25:00 and counts as stale after 5 minutes, so windows ending 30:00 or later carry it
        assertThat(out.scores()).filteredOn(s -> s.windowEnd().isBefore(at(30, 0)))
                .isNotEmpty().allSatisfy(s -> assertThat(s.staleSources()).isEmpty());
        assertThat(out.scores()).filteredOn(s -> !s.windowEnd().isBefore(at(30, 0)))
                .isNotEmpty().allSatisfy(s -> assertThat(s.staleSources()).containsExactly("reddit"));
        // scoring did not stop: the news ticker is scored after the outage began, from trades and news alone
        assertThat(out.scores()).anyMatch(s -> s.ticker().equals(SyntheticDay.NEWS_MOVE) && !s.windowEnd().isBefore(at(45, 0)));
    }
}
