package dev.pumpwatch.pipeline.scorer;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.SourceHealth;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.Fx;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Status;

class ScorerStageTest {
    /** Has an event time (so Streams reads it) but a field of the wrong type. */
    static final String BAD = "{\"eventTime\":\"2026-01-01T00:00:00Z\",\"windowMinutes\":\"x\"}";
    SimpleMeterRegistry meters = new SimpleMeterRegistry();
    ScorerHealth health = new ScorerHealth("rules-v1", meters);
    TopologyTestDriver d;
    TestInputTopic<String, String> features, sources;
    TestOutputTopic<String, String> scores;

    @BeforeEach
    void setUp() {
        StreamsBuilder b = new StreamsBuilder();
        ScorerStage.build(b, new RuleScorer(), 5, Duration.ofMinutes(5), health);
        d = Fx.driver(b.build());
        features = d.createInputTopic(Topics.FEATURES, Serdes.String().serializer(), Serdes.String().serializer());
        sources = d.createInputTopic(Topics.SOURCE_HEALTH, Serdes.String().serializer(), Serdes.String().serializer());
        scores = d.createOutputTopic(Topics.SCORES, Serdes.String().deserializer(), Serdes.String().deserializer());
    }

    @AfterEach
    void tearDown() {
        d.close();
    }

    void report(String source, boolean healthy, Instant since) {
        sources.pipeInput(source, Json.toJson(new SourceHealth(1, at(0, 0), at(0, 0), source, healthy, since)));
    }

    Score scoreWindowEndingAt(Instant end) {
        features.pipeInput("GME", Json.toJson(new Features(1, end, end, "GME", end.minusSeconds(300), end, 5,
                Map.of("mentionRatio", 10.0), null)));
        List<Score> out = scores.readValuesToList().stream().map(v -> Json.fromJson(v, Score.class)).toList();
        assertThat(out).hasSize(1);
        return out.get(0);
    }

    @Test
    void noReportsMeansNoMarker() {
        assertThat(scoreWindowEndingAt(at(20, 0)).staleSources()).isEmpty();
    }

    @Test
    void sourceUnhealthyForFiveMinutesIsMarkedAndScoringContinues() {
        report("bluesky", false, at(10, 0));
        Score s = scoreWindowEndingAt(at(15, 0)); // exactly five minutes into the outage
        assertThat(s.staleSources()).containsExactly("bluesky");
        assertThat(s.score()).isEqualTo(35);
    }

    @Test
    void shorterOutageIsNotMarked() {
        report("bluesky", false, at(10, 0));
        assertThat(scoreWindowEndingAt(at(14, 59)).staleSources()).isEmpty();
    }

    @Test
    void recoveryAndHealthySourcesClearTheMarker() {
        report("bluesky", false, at(0, 0));
        report("alpaca", true, null);
        assertThat(scoreWindowEndingAt(at(20, 0)).staleSources()).containsExactly("bluesky");
        report("bluesky", true, null);
        assertThat(scoreWindowEndingAt(at(21, 0)).staleSources()).isEmpty();
    }

    @Test
    void latestReportPerSourceWinsAndGarbageIsIgnored() {
        report("bluesky", false, at(0, 0));
        report("alpaca", false, at(1, 0));
        sources.pipeInput("junk", "not json");
        assertThat(scoreWindowEndingAt(at(30, 0)).staleSources()).containsExactlyInAnyOrder("bluesky", "alpaca");
    }

    @Test
    void healthStateLivesInAStoreRebuiltFromTheTopic() {
        report("bluesky", false, at(0, 0));
        assertThat(d.getKeyValueStore(ScorerStage.HEALTH_STORE).get("bluesky")).isNotNull();
    }

    @Test
    void healthCountsScoredDroppedAndStale() {
        report("bluesky", false, at(0, 0));
        scoreWindowEndingAt(at(20, 0));
        features.pipeInput("GME", BAD);
        assertThat(meters.counter("pumpwatch.scorer.scored", "model", "rules-v1").count()).isEqualTo(1);
        assertThat(meters.counter("pumpwatch.scorer.dropped", "model", "rules-v1").count()).isEqualTo(1);
        assertThat(meters.counter("pumpwatch.scorer.stale", "model", "rules-v1").count()).isEqualTo(1);
        assertThat(health.health().getStatus()).isEqualTo(Status.UP);
        assertThat(health.health().getDetails()).containsEntry("modelVersion", "rules-v1").containsEntry("scored", 1L);
    }

    @Test
    void healthGoesDownWhenMostInputIsUnreadable() {
        for (int i = 0; i < 10; i++) features.pipeInput("GME", BAD);
        assertThat(health.health().getStatus()).isEqualTo(Status.DOWN);
    }
}
