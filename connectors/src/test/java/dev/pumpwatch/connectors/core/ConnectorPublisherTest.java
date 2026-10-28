package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.DeadLetter;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Status;

class ConnectorPublisherTest {
    record Sent(String topic, String key, String value) {}

    static class FakeSender implements ConnectorPublisher.Sender {
        final List<Sent> sent = new CopyOnWriteArrayList<>();
        final AtomicInteger failures = new AtomicInteger();
        final AtomicInteger calls = new AtomicInteger();

        @Override
        public CompletableFuture<?> send(String topic, String key, String value) {
            calls.incrementAndGet();
            if (failures.get() > 0) {
                failures.decrementAndGet();
                return CompletableFuture.failedFuture(new RuntimeException("broker down"));
            }
            sent.add(new Sent(topic, key, value));
            return CompletableFuture.completedFuture(null);
        }
    }

    private final FakeClock clock = new FakeClock();
    private final FakeSender sender = new FakeSender();
    private final InMemoryOutbox outbox = new InMemoryOutbox();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    private ConnectorPublisher publisher(int capacity) {
        var props = new PumpwatchKafkaProperties(10, Duration.ofMinutes(2), Duration.ofSeconds(10), 5, capacity, 100,
                Duration.ofMillis(1), Duration.ofMillis(5), Duration.ofSeconds(60), Duration.ofSeconds(120));
        return new ConnectorPublisher("alpaca", outbox, sender, props, meters, clock);
    }

    private TickRecord tick(String ticker, double price, long size) {
        var now = clock.instant();
        return new TickRecord(SchemaVersions.TICK, now, now, ticker, BigDecimal.valueOf(price), size, "X");
    }

    @Test
    void fullBufferRejectsOffersAndTurnsHealthDown() {
        var p = publisher(2);
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
        assertThat(p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1))).isTrue();
        assertThat(p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 2))).isTrue();
        assertThat(p.isAcceptingRecords()).isFalse();
        assertThat(p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 3))).isFalse();
        assertThat(p.health().getStatus()).isEqualTo(Status.DOWN);
        assertThat(p.drainOnce()).isTrue();
        assertThat(p.isAcceptingRecords()).isTrue();
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
    }

    @Test
    void sourceHealthTracksWhenTheUnhealthySpellBegan() {
        var p = publisher(1);
        assertThat(p.sourceHealth().healthy()).isTrue();
        assertThat(p.sourceHealth().unhealthySince()).isNull();
        p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1)); // buffer full -> DOWN
        var began = clock.instant();
        assertThat(p.sourceHealth().healthy()).isFalse();
        clock.advance(Duration.ofMinutes(6));
        var later = p.sourceHealth();
        assertThat(later.healthy()).isFalse();
        assertThat(later.unhealthySince()).isEqualTo(began);
        assertThat(later.source()).isEqualTo("alpaca");
        p.drainOnce();
        p.markFetched(); // six silent minutes also fail the fetch-age check
        assertThat(p.sourceHealth().healthy()).isTrue();
        assertThat(p.sourceHealth().unhealthySince()).isNull();
    }

    @Test
    void invalidRecordGoesToDeadLetterWithReasonAndPayloadAndProcessingContinues() {
        var p = publisher(10);
        var bad = tick("AAA", -1, 1);
        assertThat(p.offer(Topics.TICKS, "AAA", bad)).isTrue();
        assertThat(p.offer(Topics.TICKS, "AAA", tick("AAA", 2, 2))).isTrue();
        p.drainOnce();
        assertThat(sender.sent).extracting(Sent::topic).containsExactly(Topics.INGEST_DLQ, Topics.TICKS);
        var dl = Json.fromJson(sender.sent.get(0).value(), DeadLetter.class);
        assertThat(dl.sourceTopic()).isEqualTo(Topics.TICKS);
        assertThat(dl.reason()).contains("price must be > 0");
        assertThat(dl.originalPayload()).isEqualTo(Json.toJson(bad));
        assertThat(meters.get("pumpwatch.connector.dead_letter").tag("connector", "alpaca").counter().count())
                .isEqualTo(1);
        assertThat(meters.get("pumpwatch.connector.published").tag("connector", "alpaca").counter().count())
                .isEqualTo(1);
    }

    @Test
    void sendFailureKeepsRecordAndRetries() {
        var p = publisher(10);
        p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1));
        p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 2));
        sender.failures.set(1);
        assertThat(p.drainOnce()).isFalse();
        assertThat(p.bufferSize()).isEqualTo(2);
        assertThat(sender.sent).isEmpty();
        assertThat(sender.calls).hasValue(1); // stops at the first already-failed send instead of trying the rest
        assertThat(p.drainOnce()).isTrue();
        assertThat(p.bufferSize()).isZero();
        assertThat(sender.sent).hasSize(2);
        assertThat(Json.fromJson(sender.sent.get(0).value(), TickRecord.class).size()).isEqualTo(1);
    }

    @Test
    void brokerFailingLongerThanThresholdTurnsHealthDown() {
        var p = publisher(10);
        p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1));
        sender.failures.set(100);
        p.drainOnce();
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
        clock.advance(Duration.ofSeconds(61));
        p.markFetched();
        assertThat(p.health().getStatus()).isEqualTo(Status.DOWN);
        sender.failures.set(0);
        p.drainOnce();
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
    }

    @Test
    void staleLastFetchTurnsHealthDown() {
        var p = publisher(10);
        p.markFetched();
        clock.advance(Duration.ofSeconds(119));
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
        clock.advance(Duration.ofSeconds(2));
        assertThat(p.health().getStatus()).isEqualTo(Status.DOWN);
        assertThat(meters.get("pumpwatch.connector.last_fetch.age.seconds").tag("connector", "alpaca").gauge().value())
                .isEqualTo(121.0);
        p.markFetched();
        assertThat(p.health().getStatus()).isEqualTo(Status.UP);
    }

    @Test
    void senderLoopRetriesUntilBrokerReturns() throws Exception {
        var p = publisher(10);
        sender.failures.set(3);
        p.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1));
        p.start();
        try {
            long deadline = System.currentTimeMillis() + 5000;
            while (sender.sent.isEmpty() && System.currentTimeMillis() < deadline) Thread.sleep(5);
            assertThat(sender.sent).hasSize(1);
            assertThat(p.bufferSize()).isZero();
        } finally {
            p.close();
        }
    }

    @Test
    void pendingRowsSurviveARestartAndAreSentInOrder() {
        var first = publisher(10);
        first.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1));
        first.offer(Topics.TICKS, "AAA", tick("AAA", 1, 2));
        // a new publisher on the same store is a process restart: nothing was sent, nothing was lost
        var second = publisher(10);
        assertThat(second.bufferSize()).isEqualTo(2);
        assertThat(second.drainOnce()).isTrue();
        assertThat(sender.sent).extracting(x -> Json.fromJson(x.value(), TickRecord.class).size())
                .containsExactly(1L, 2L);
        assertThat(outbox.count("alpaca")).isZero();
    }

    @Test
    void failedSendLeavesItsRowAndFullOutboxCountsRowsFromStartup() {
        var first = publisher(2);
        first.offer(Topics.TICKS, "AAA", tick("AAA", 1, 1));
        first.offer(Topics.TICKS, "AAA", tick("AAA", 1, 2));
        var second = publisher(2);
        assertThat(second.isAcceptingRecords()).isFalse();
        sender.failures.set(1);
        assertThat(second.drainOnce()).isFalse();
        assertThat(outbox.count("alpaca")).isEqualTo(2);
    }
}
