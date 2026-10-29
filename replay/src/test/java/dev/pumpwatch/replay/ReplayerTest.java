package dev.pumpwatch.replay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.pumpwatch.common.Headers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

class ReplayerTest {
    static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    final List<RecordedEvent> data = new ArrayList<>();
    final List<ProducerRecord<String, String>> sent = new ArrayList<>();
    final List<Duration> sleeps = new ArrayList<>();
    final Replayer replayer = new Replayer(
            (from, to, afterTime, afterId, limit) -> data.stream()
                    .filter(e -> !e.eventTime().isBefore(from) && e.eventTime().isBefore(to))
                    .sorted(Comparator.comparing(RecordedEvent::eventTime).thenComparingLong(RecordedEvent::id))
                    .filter(e -> e.eventTime().isAfter(afterTime)
                            || (e.eventTime().equals(afterTime) && e.id() > afterId))
                    .limit(limit).toList(),
            sent::add, sleeps::add, Runnable::run);

    void add(long id, String topic, int seconds) {
        data.add(new RecordedEvent(id, topic, "k" + id, T0.plusSeconds(seconds), "{\"n\":" + id + "}", 0, id));
    }

    static String header(ProducerRecord<?, ?> r, String name) {
        return new String(r.headers().lastHeader(name).value(), StandardCharsets.UTF_8);
    }

    @Test
    void tenSecondGapAtSpeedTenSleepsAboutOneSecond() throws Exception {
        add(1, "ticks", 0);
        add(2, "ticks", 10);
        add(3, "ticks", 20);
        replayer.run("run-1", T0, T0.plusSeconds(60), 10, false);
        assertThat(sleeps).containsExactly(Duration.ofSeconds(1), Duration.ofSeconds(1));
    }

    @Test
    void originalSpeedKeepsGapsAndTinyGapsAreAccumulatedNotSlept() throws Exception {
        add(1, "ticks", 0);
        add(2, "ticks", 3);
        data.add(new RecordedEvent(3, "ticks", "k3", T0.plusSeconds(3).plusMillis(1), "{}", 0, 3));
        replayer.run("run-1", T0, T0.plusSeconds(60), 1, false);
        assertThat(sleeps).containsExactly(Duration.ofSeconds(3));
    }

    @Test
    void publishesInEventTimeOrderWithReplayHeadersToSameTopic() throws Exception {
        add(1, "raw-posts", 5);
        add(2, "ticks", 1);
        add(3, "raw-news", 3);
        long n = replayer.run("run-1", T0, T0.plusSeconds(60), 1000, false);
        assertThat(n).isEqualTo(3);
        assertThat(sent).extracting(ProducerRecord::topic).containsExactly("ticks", "raw-news", "raw-posts");
        assertThat(sent).allSatisfy(r -> {
            assertThat(header(r, Headers.REPLAY)).isEqualTo("true");
            assertThat(header(r, Headers.RUN_ID)).isEqualTo("run-1");
        });
    }

    @Test
    void derivedTopicsAreRecordedButNeverReplayedBecauseThePipelineRegeneratesThem() throws Exception {
        add(1, "ticks", 0);
        add(2, "features", 1);
        add(3, "scores", 2);
        add(4, "flags", 3);
        add(5, "raw-posts", 4);
        long n = replayer.run("run-1", T0, T0.plusSeconds(60), 1000, false);
        assertThat(n).isEqualTo(2);
        assertThat(sent).extracting(ProducerRecord::topic).containsExactly("ticks", "raw-posts");
    }

    @Test
    void isolatedModeUsesRunTopic() throws Exception {
        add(1, "ticks", 0);
        replayer.run("run-1", T0, T0.plusSeconds(60), 1, true);
        assertThat(sent.get(0).topic()).isEqualTo("replay.run-1.ticks");
    }

    @Test
    void respectsRangeAndPagesPastPageSize() throws Exception {
        for (int i = 0; i < Replayer.PAGE + 10; i++) {
            data.add(new RecordedEvent(i + 1, "ticks", "k", T0.plusSeconds(1), "{}", 0, i));
        }
        add(9999, "ticks", 500);
        long n = replayer.run("run-1", T0, T0.plusSeconds(100), 1, false);
        assertThat(n).isEqualTo(Replayer.PAGE + 10);
    }

    @Test
    void rejectsBadArguments() {
        assertThatThrownBy(() -> replayer.start(T0, T0, 1, false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> replayer.start(T0, T0.plusSeconds(1), 0, false))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
