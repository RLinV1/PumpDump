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
}
