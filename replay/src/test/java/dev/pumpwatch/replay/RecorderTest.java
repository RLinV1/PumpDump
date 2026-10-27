package dev.pumpwatch.replay;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Headers;
import java.time.Instant;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;

class RecorderTest {
    static ConsumerRecord<String, String> rec(String topic, String key, String value) {
        return new ConsumerRecord<>(topic, 0, 0L, key, value);
    }

    @Test
    void parsesEventTimeAndKeepsPayload() {
        String json = "{\"schemaVersion\":1,\"eventTime\":\"2026-01-01T00:00:05Z\",\"ticker\":\"ABC\"}";
        List<RecordedEvent> out = Recorder.toEvents(List.of(rec("ticks", "ABC", json)));
        assertThat(out).hasSize(1);
        assertThat(out.get(0).eventTime()).isEqualTo(Instant.parse("2026-01-01T00:00:05Z"));
        assertThat(out.get(0).topic()).isEqualTo("ticks");
        assertThat(out.get(0).key()).isEqualTo("ABC");
        assertThat(out.get(0).payload()).isEqualTo(json);
    }

    @Test
    void sameKeyAndEventTimeAtDifferentOffsetsAreBothKept() {
        String json = "{\"eventTime\":\"2026-01-01T00:00:05Z\"}";
        var out = Recorder.toEvents(List.of(new ConsumerRecord<>("ticks", 0, 7L, "ABC", json),
                new ConsumerRecord<>("ticks", 0, 8L, "ABC", json)));
        assertThat(out).extracting(RecordedEvent::offset).containsExactly(7L, 8L);
    }

    @Test
    void skipsReplayedRecords() {
        ConsumerRecord<String, String> replayed =
                rec("ticks", "ABC", "{\"eventTime\":\"2026-01-01T00:00:05Z\"}");
        replayed.headers().add(Headers.REPLAY, "true".getBytes());
        assertThat(Recorder.toEvents(List.of(replayed))).isEmpty();
    }

    @Test
    void skipsMalformedAndNullKeyBecomesEmpty() {
        List<RecordedEvent> out = Recorder.toEvents(List.of(
                rec("ticks", "A", "not json"),
                rec("ticks", "A", "{\"x\":1}"),
                rec("raw-news", null, "{\"eventTime\":\"2026-01-01T00:00:05Z\"}")));
        assertThat(out).hasSize(1);
        assertThat(out.get(0).key()).isEmpty();
    }
}
