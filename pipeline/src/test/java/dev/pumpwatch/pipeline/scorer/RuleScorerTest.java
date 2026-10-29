package dev.pumpwatch.pipeline.scorer;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.Fx;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.Test;

class RuleScorerTest {
    final RuleScorer scorer = new RuleScorer();

    static Features f(int minutes, double ratio, double authors, double ret, double volume) {
        return new Features(1, at(10, 0), at(10, 1), "GME", at(10, 0).minusSeconds(minutes * 60L), at(10, 0), minutes,
                Map.of("mentions", 10.0, "trades", 5.0, "mentionRatio", ratio, "distinctAuthors", authors,
                        "return", ret, "volume", volume), null);
    }

    @Test
    void quietWindowScoresZero() {
        assertThat(scorer.score(f(5, 1, 1, 0.0, 10)).score()).isZero();
        assertThat(scorer.contributors(f(5, 1, 1, 0.0, 10))).isEmpty();
    }

    @Test
    void highestMatchingTierPerTermIsUsedNotTheSum() {
        assertThat(scorer.score(f(5, 3, 0, 0, 0)).score()).isEqualTo(20);
        assertThat(scorer.score(f(5, 10, 0, 0, 0)).score()).isEqualTo(35);
        assertThat(scorer.score(f(5, 0, 5, 0, 0)).score()).isEqualTo(5);
        assertThat(scorer.score(f(5, 0, 0, 0.05, 0)).score()).isEqualTo(20);
        assertThat(scorer.score(f(5, 0, 0, 0.1499, 0)).score()).isEqualTo(20);
        assertThat(scorer.score(f(5, 0, 0, 0, 1_000_000)).score()).isEqualTo(20);
    }

    @Test
    void everythingMaxedScores100AndNegativeReturnsAddNothing() {
        assertThat(scorer.score(f(5, 99, 99, 0.5, 5e6)).score()).isEqualTo(100);
        assertThat(scorer.score(f(5, 0, 0, -0.5, 0)).score()).isZero();
    }

    @Test
    void scoreRecordCarriesModelVersionAndTimes() {
        Score s = scorer.score(f(5, 10, 20, 0.2, 2e6));
        assertThat(s.modelVersion()).isEqualTo("rules-v1");
        assertThat(s.eventTime()).isEqualTo(s.windowEnd()).isEqualTo(at(10, 0));
        assertThat(Validator.validate(s)).isEmpty();
    }

    @Test
    void contributorsAreGroupPointsLargestFirst() {
        List<Flag.Contributor> c = scorer.contributors(f(5, 10, 5, 0.06, 0));
        assertThat(c).extracting(Flag.Contributor::featureGroup).containsExactly("social", "market");
        assertThat(c).extracting(Flag.Contributor::delta).containsExactly(40.0, 20.0);
    }

    /** The doc table is the contract: every row must equal a RuleScorer term, in order. */
    @Test
    void documentedTableMatchesTheCode() throws IOException {
        List<String> doc = new ArrayList<>();
        for (String line : Files.readAllLines(Path.of("..", "docs", "rule-scorer.md"))) {
            String[] c = line.split("\\|");
            if (c.length == 6 && c[3].trim().startsWith("`")) {
                doc.add(String.join("|", c[1].trim(), c[2].trim(), c[3].trim().replace("`", ""), num(c[4]), num(c[5])));
            }
        }
        List<String> code = RuleScorer.TERMS.stream()
                .map(t -> String.join("|", t.name(), t.group(), t.feature(), num(t.atLeast()), num(t.points()))).toList();
        assertThat(doc).isNotEmpty().isEqualTo(code);
    }

    private static String num(String s) {
        return num(Double.parseDouble(s.trim()));
    }

    private static String num(double d) {
        return new java.math.BigDecimal(d).stripTrailingZeros().toPlainString();
    }

    @Test
    void stageScoresOnlyTheScoringWindowAndWritesKeyedScores() {
        StreamsBuilder b = new StreamsBuilder();
        ScorerStage.build(b, scorer, 5);
        try (TopologyTestDriver d = Fx.driver(b.build())) {
            TestInputTopic<String, String> in =
                    d.createInputTopic(Topics.FEATURES, Serdes.String().serializer(), Serdes.String().serializer());
            in.pipeInput("GME", Json.toJson(f(1, 99, 99, 1, 9e6)));
            in.pipeInput("GME", Json.toJson(f(5, 10, 0, 0, 0)));
            in.pipeInput("GME", "garbage");
            TestOutputTopic<String, String> out = d.createOutputTopic(Topics.SCORES,
                    Serdes.String().deserializer(), Serdes.String().deserializer());
            var kvs = out.readKeyValuesToList();
            assertThat(kvs).hasSize(1);
            assertThat(kvs.get(0).key).isEqualTo("GME");
            assertThat(Json.fromJson(kvs.get(0).value, Score.class).score()).isEqualTo(35);
        }
    }
}
