package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.SchemaVersions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class NewsSinkTest {
    @Test
    void itemRefusedByAFullBufferIsNotMarkedSeen() {
        var props = PumpwatchKafkaProperties.defaults();
        var outbox = new InMemoryOutbox() {
            @Override
            public synchronized long count(String connector) {
                return Long.MAX_VALUE; // always full
            }
        };
        var publisher = new ConnectorPublisher("rss", outbox, (t, k, v) -> CompletableFuture.completedFuture(null),
                props, new SimpleMeterRegistry(), Clock.systemUTC());
        Set<String> seen = new HashSet<>();
        var stopped = new boolean[] {false};
        var sink = new NewsSink(publisher, (s, i) -> seen.contains(s + i), (s, i) -> seen.add(s + i), () -> stopped[0]);
        var a = new ArticleRecord(SchemaVersions.ARTICLE, Instant.now().minusSeconds(5), Instant.now(), "rss:x", "1",
                "Headline", null, List.of(), Fingerprints.fingerprint("Headline"));

        stopped[0] = true; // stop while waiting on the full buffer
        assertThat(sink.publish(a)).isFalse();
        assertThat(seen).isEmpty();
    }

    @Test
    void sameStoryFromTwoSourcesKeepsBothRecordsWithOneFingerprint() {
        var outbox = new InMemoryOutbox();
        var publisher = new ConnectorPublisher("news", outbox, (t, k, v) -> CompletableFuture.completedFuture(null),
                PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());
        Set<String> seen = new HashSet<>();
        var sink = new NewsSink(publisher, (s, i) -> seen.contains(s + "|" + i), (s, i) -> seen.add(s + "|" + i),
                () -> false);
        Instant t = Instant.now().minusSeconds(5);
        var wire = new ArticleRecord(SchemaVersions.ARTICLE, t, Instant.now(), "alpaca-news", "a-1",
                "ABC Corp. wins contract", null, List.of("ABC"), Fingerprints.fingerprint("ABC Corp. wins contract"));
        var pr = new ArticleRecord(SchemaVersions.ARTICLE, t, Instant.now(), "rss:prnewswire", "guid-9",
                "PRESS RELEASE: ABC Corp wins contract!", "http://pr/9", List.of("ABC"),
                Fingerprints.fingerprint("PRESS RELEASE: ABC Corp wins contract!"));

        assertThat(sink.publish(wire)).isTrue();
        assertThat(sink.publish(pr)).isTrue(); // dedup is per (source, itemId); no cross-source drop
        assertThat(wire.fingerprint()).isEqualTo(pr.fingerprint());
        assertThat(outbox.count("news")).isEqualTo(2);
    }
}
