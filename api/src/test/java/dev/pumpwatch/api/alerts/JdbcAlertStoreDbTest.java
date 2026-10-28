package dev.pumpwatch.api.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.api.ReadRepository;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.SchemaVersions;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ReadRepository.class, JdbcAlertStore.class})
class JdbcAlertStoreDbTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
        r.add("spring.flyway.table", () -> "flyway_history_api");
    }

    @Autowired ReadRepository repo;
    @Autowired JdbcAlertStore store;
    @Autowired JdbcTemplate jdbc;

    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");

    static void save(ReadRepository repo, String run, String topic, long off, String ticker) {
        var e = new Flag.Evidence(70, "rules-1", List.of(), 5, 2, new Flag.CatalystCheck(false, T, T, List.of()));
        repo.saveFlag(run, topic, 0, off, new Flag(SchemaVersions.FLAG, T, T, ticker, T, e));
    }

    @Test
    void onlyLiveFlagsAreDecidedAndEachFlagIsQueuedOncePerChannel() {
        save(repo, "live", "flags", 1, "GME");
        save(repo, "run-1", "replay.run-1.flags", 1, "AMC");
        var pending = store.pendingFlags("webhook-1", T.minusSeconds(60), 10);
        assertThat(pending).extracting(f -> f.ticker()).containsExactly("GME");

        assertThat(store.enqueueSingle("webhook-1", pending.get(0), "msg", T)).isTrue();
        assertThat(store.enqueueSingle("webhook-1", pending.get(0), "msg", T)).isFalse();
        assertThat(store.pendingFlags("webhook-1", T.minusSeconds(60), 10)).isEmpty();
        assertThat(store.pendingFlags("webhook-2", T.minusSeconds(60), 10)).hasSize(1); // other channel still owed
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM alert_outbox", Integer.class)).isEqualTo(1);
        assertThat(store.lastAlerted("webhook-1")).containsKey("GME");
    }

    @Test
    void failureSchedulesRetryThenGivesUp() {
        save(repo, "live", "flags", 2, "TSLA");
        var f = store.pendingFlags("webhook-9", T.minusSeconds(60), 10).get(0);
        store.enqueueSingle("webhook-9", f, "msg", T);
        long id = store.due(T, 10).stream().filter(d -> d.channel().equals("webhook-9")).findFirst().orElseThrow().id();
        store.markFailed(id, "HTTP 503", T.plusSeconds(10));
        assertThat(store.due(T, 10)).noneMatch(d -> d.id() == id);
        assertThat(store.due(T.plusSeconds(10), 10)).anyMatch(d -> d.id() == id && d.attempts() == 1);
        store.markFailed(id, "HTTP 503", null);
        assertThat(store.due(T.plusSeconds(999), 10)).noneMatch(d -> d.id() == id);
    }
}
