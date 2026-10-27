package dev.pumpwatch.connectors.core;

import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

/** Migrated JdbcTemplate on a Testcontainers Postgres, for the Docker-only tests. */
final class TestDb {
    private TestDb() {}

    static JdbcTemplate migrated(PostgreSQLContainer<?> pg) {
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()).load().migrate();
        return new JdbcTemplate(new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()));
    }
}
