package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.SchemaVersions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** News item ids and SEC accession numbers stay seen across a restart (a new SeenItems on the same database). */
@Testcontainers(disabledWithoutDocker = true)
class SeenItemsRestartTest {
    @Container static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void accessionNumberAndNewsIdAreStillSeenAfterRestart() {
        var jdbc = TestDb.migrated(PG);
        var before = new SeenItems(jdbc);
        assertThat(before.markNew("sec", "0001234567-26-000001")).isTrue();
        assertThat(before.markNew("finnhub", "987")).isTrue();

        var after = new SeenItems(jdbc);
        assertThat(after.isSeen("sec", "0001234567-26-000001")).isTrue();
        assertThat(after.markNew("sec", "0001234567-26-000001")).isFalse();
        assertThat(after.isSeen("finnhub", "987")).isTrue();
    }

    @Test
    void duplicateNewsItemAfterRestartIsNotRepublished() {
        var jdbc = TestDb.migrated(PG);
        var a = new ArticleRecord(SchemaVersions.ARTICLE, Instant.now().minusSeconds(5), Instant.now(), "alpaca-news",
                "n-42", "Headline", null, List.of("ABC"), Fingerprints.fingerprint("Headline"));

        assertThat(sink(jdbc, new InMemoryOutbox()).publish(a)).isTrue();

        var outbox2 = new InMemoryOutbox(); // fresh process: new sink and SeenItems over the same table
        assertThat(sink(jdbc, outbox2).publish(a)).isFalse();
        assertThat(outbox2.count("news")).isZero();
    }

    private static NewsSink sink(JdbcTemplate jdbc, InMemoryOutbox outbox) {
        var publisher = new ConnectorPublisher("news", outbox, (t, k, v) -> CompletableFuture.completedFuture(null),
                PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());
        var seen = new SeenItems(jdbc);
        return new NewsSink(publisher, seen::isSeen, seen::markNew, () -> false);
    }
}
