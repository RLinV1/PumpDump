package dev.pumpwatch.pipeline.extractor;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.pipeline.Fx;
import java.util.List;
import java.util.Set;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.Test;

class MentionExtractorTest {
    private List<org.apache.kafka.streams.KeyValue<String, String>> run(String... posts) {
        StreamsBuilder b = new StreamsBuilder();
        MentionExtractor.build(b, Set.of("GME", "AMC"));
        try (TopologyTestDriver d = Fx.driver(b.build())) {
            TestInputTopic<String, String> in =
                    d.createInputTopic(Topics.RAW_POSTS, Serdes.String().serializer(), Serdes.String().serializer());
            for (int i = 0; i < posts.length; i++) in.pipeInput("reddit:" + i, posts[i]);
            TestOutputTopic<String, String> out = d.createOutputTopic(Topics.MENTIONS,
                    Serdes.String().deserializer(), Serdes.String().deserializer());
            return out.readKeyValuesToList();
        }
    }

    @Test
    void oneMentionPerWatchlistCashtagKeyedByTicker() {
        var out = run(Fx.post(at(1, 0), "alice", "$gme to the moon, also $AMC and $GME again, $ZZZZ ignored, cost $5"));
        assertThat(out).extracting(kv -> kv.key).containsExactlyInAnyOrder("GME", "AMC");
        Mention m = Json.fromJson(out.get(0).value, Mention.class);
        assertThat(m.eventTime()).isEqualTo(at(1, 0));
        assertThat(m.authorId()).isEqualTo("alice");
        assertThat(m.ticker()).isEqualTo(out.get(0).key);
    }

    @Test
    void dropsPostsWithoutWatchlistCashtagAndInvalidPosts() {
        assertThat(run(Fx.post(at(1, 0), "a", "GME without a cashtag"), "not json",
                Fx.post(at(1, 0), "", "$GME blank author"))).isEmpty();
    }
}
