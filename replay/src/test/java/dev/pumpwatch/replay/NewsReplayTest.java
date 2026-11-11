package dev.pumpwatch.replay;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.FilingRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Topics;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.annotation.KafkaListener;

/** No-Docker check of the news/filing path: Recorder.toEvents -> store ordering -> Replayer. */
class NewsReplayTest {
    static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void recorderListensToNewsAndFilingTopics() throws NoSuchMethodException {
        var topics = Recorder.class.getMethod("onBatch", List.class).getAnnotation(KafkaListener.class).topics();
        assertThat(topics).contains(Topics.RAW_NEWS, Topics.RAW_FILINGS);
    }

    @Test
    void newsAndFilingsRoundTripEqualAndStayInEventTimeOrderWithPostsAndTicks() throws Exception {
        var article = new ArticleRecord(SchemaVersions.ARTICLE, T0.plusSeconds(3), T0.plusSeconds(4), "alpaca-news",
                "n1", "ABC wins contract", "http://x/1", List.of("ABC"), Fingerprints.fingerprint("ABC wins contract"));
        var filing = new FilingRecord(SchemaVersions.FILING, T0.plusSeconds(2), T0.plusSeconds(5), "0001-26-1",
                "123", "ABC", "8-K", List.of("1.01", "7.01"));
        String post = "{\"eventTime\":\"" + T0.plusSeconds(1) + "\",\"ticker\":\"ABC\"}";
        String tick = "{\"eventTime\":\"" + T0.plusSeconds(4) + "\",\"ticker\":\"ABC\"}";

        // consumed in arbitrary order, as from different topics
        List<ConsumerRecord<String, String>> in = List.of(
                new ConsumerRecord<>(Topics.RAW_NEWS, 0, 0L, "n1", Json.toJson(article)),
                new ConsumerRecord<>(Topics.TICKS, 0, 0L, "ABC", tick),
                new ConsumerRecord<>(Topics.RAW_FILINGS, 0, 0L, "0001-26-1", Json.toJson(filing)),
                new ConsumerRecord<>(Topics.RAW_POSTS, 0, 0L, "p1", post));
        List<RecordedEvent> stored = new ArrayList<>();
        long id = 1;
        for (RecordedEvent e : Recorder.toEvents(in)) {
            stored.add(new RecordedEvent(id++, e.topic(), e.key(), e.eventTime(), e.payload(), e.partition(), e.offset()));
        }
        assertThat(stored).hasSize(4);

        List<ProducerRecord<String, String>> sent = new ArrayList<>();
        new Replayer((from, to, afterTime, afterId, limit) -> stored.stream()
                .sorted(Comparator.comparing(RecordedEvent::eventTime).thenComparingLong(RecordedEvent::id))
                .filter(e -> e.eventTime().isAfter(afterTime) || (e.eventTime().equals(afterTime) && e.id() > afterId))
                .limit(limit).toList(), sent::add, d -> {}, Runnable::run)
                .run("run-1", T0, T0.plusSeconds(60), 10, false);

        assertThat(sent).extracting(ProducerRecord::topic)
                .containsExactly(Topics.RAW_POSTS, Topics.RAW_FILINGS, Topics.RAW_NEWS, Topics.TICKS);
        assertThat(Json.fromJson(sent.get(2).value(), ArticleRecord.class)).isEqualTo(article);
        assertThat(Json.fromJson(sent.get(1).value(), FilingRecord.class)).isEqualTo(filing);
        assertThat(sent.get(2).key()).isEqualTo("n1");
    }
}
