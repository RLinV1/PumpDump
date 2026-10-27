package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.SchemaVersions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class NewsSchedulerTest {
    final List<String> keys = new CopyOnWriteArrayList<>();
    final Set<String> seenSet = new HashSet<>();
    final SeenItems seen = new SeenItems(null) {
        @Override
        public synchronized boolean markNew(String source, String itemId) {
            return seenSet.add(source + "|" + itemId);
        }
    };
    NewsScheduler scheduler;

    static ArticleRecord article(String source, String id) {
        return new ArticleRecord(SchemaVersions.ARTICLE, Instant.now().minusSeconds(5), Instant.now(), source, id,
                "Headline " + id, "https://example.com/" + id, List.of(), Fingerprints.fingerprint("Headline " + id));
    }

    ConnectorPublisher publisher(String name) {
        var p = new ConnectorPublisher(name, (t, k, v) -> {
            keys.add(name + ":" + t + ":" + k);
            return CompletableFuture.completedFuture(null);
        }, PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());
        p.start();
        return p;
    }

    record Poller(String name, AtomicInteger runs, boolean fail) implements NewsSource {
        @Override public boolean streaming() { return false; }
        @Override public Duration interval() { return Duration.ofMillis(10); }

        @Override
        public void run(NewsSink sink) {
            int n = runs.incrementAndGet();
            if (fail) throw new IllegalStateException("boom " + n);
            sink.publish(article(name, "same")); // repeated every poll: must publish once
            sink.publish(article(name, "item-" + n));
            sink.fetched();
        }
    }

    static void await(BooleanSupplier c) throws InterruptedException {
        for (int i = 0; i < 300 && !c.getAsBoolean(); i++) Thread.sleep(20);
        assertThat(c.getAsBoolean()).isTrue();
    }

    @AfterEach
    void stop() {
        if (scheduler != null) scheduler.stop();
    }

    @Test
    void failingSourceDoesNotStopAnotherAndDuplicatesPublishOnce() throws Exception {
        var bad = new Poller("bad", new AtomicInteger(), true);
        var good = new Poller("good", new AtomicInteger(), false);
        scheduler = new NewsScheduler(List.of(bad, good), this::publisher, seen);
        scheduler.start();

        await(() -> good.runs().get() >= 4 && bad.runs().get() >= 3);
        await(() -> keys.stream().filter(k -> k.startsWith("good:")).count() >= 4);
        assertThat(keys).filteredOn(k -> k.equals("good:raw-news:same")).hasSize(1);
        assertThat(keys).noneMatch(k -> k.startsWith("bad:"));
        assertThat(bad.runs().get()).isGreaterThan(1); // kept retrying, did not die
    }

    @Test
    void streamSourceThatEndsIsRestartedAfterBackoff() throws Exception {
        var runs = new AtomicInteger();
        NewsSource s = new NewsSource() {
            @Override public String name() { return "stream"; }
            @Override public boolean streaming() { return true; }
            @Override public Duration interval() { return Duration.ZERO; }
            @Override public void run(NewsSink sink) { runs.incrementAndGet(); }
        };
        scheduler = new NewsScheduler(List.of(s), this::publisher, seen);
        scheduler.start();
        await(() -> runs.get() >= 2);
    }

    @Test
    void backoffGrowsAndIsCapped() {
        assertThat(NewsScheduler.backoff(0).toSeconds()).isEqualTo(1);
        assertThat(NewsScheduler.backoff(3).toSeconds()).isEqualTo(8);
        assertThat(NewsScheduler.backoff(50).toSeconds()).isEqualTo(60);
    }
}
