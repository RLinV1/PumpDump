package dev.pumpwatch.connectors.rss;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Needs Docker; skipped without it. Runs the real migrations, then the store against Postgres. */
@Testcontainers(disabledWithoutDocker = true)
class JdbcFeedStateStoreTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void savesAndUpdatesEtagAndLastModifiedPerFeed() {
        var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
        Flyway.configure().dataSource(ds).table("flyway_history_connectors").baselineOnMigrate(true).load().migrate();
        var store = new JdbcFeedStateStore(new JdbcTemplate(ds));

        assertThat(store.get("https://a.test/feed")).isEmpty();
        store.save("https://a.test/feed", new FeedState("\"e1\"", "Mon, 01 Jan 2026 00:00:00 GMT"));
        store.save("https://a.test/feed", new FeedState("\"e2\"", null));
        assertThat(store.get("https://a.test/feed")).contains(new FeedState("\"e2\"", null));
        assertThat(store.get("https://b.test/feed")).isEmpty();
    }
}
