package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.autoconfigure.flyway.FlywayProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.FileSystemResource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class SharedSchemaMigrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");

    @ParameterizedTest
    @CsvSource({"connectors,replay,api", "connectors,api,replay", "replay,connectors,api",
            "replay,api,connectors", "api,connectors,replay", "api,replay,connectors"})
    void everyAppCreatesItsTablesRegardlessOfSharedSchemaStartupOrder(String first, String second, String third)
            throws Exception {
        String schema = "startup_" + first + "_" + second + "_" + third;
        List<String> order = List.of(first, second, third);
        for (String module : order) migrate(module, schema);
        for (String module : order) migrate(module, schema); // a restart must also be safe

        try (var connection = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             var query = connection.prepareStatement("SELECT to_regclass(?)")) {
            for (String table : List.of("seen_items", "connector_positions", "outbox", "recorded_events",
                    "api_scores", "api_flags", "alert_flags", "alert_outbox")) {
                query.setString(1, schema + "." + table);
                try (var result = query.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).as("%s after %s", table, order).isNotNull();
                }
            }
        }
    }

    private static void migrate(String module, String schema) throws Exception {
        Path resources = Path.of("..", module, "src", "main", "resources").toAbsolutePath().normalize();
        var yaml = new YamlPropertySourceLoader().load(module, new FileSystemResource(resources.resolve("application.yml")));
        var properties = new Binder(ConfigurationPropertySources.from(yaml))
                .bind("spring.flyway", Bindable.of(FlywayProperties.class)).get();
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
                .schemas(schema).defaultSchema(schema).table(properties.getTable())
                .baselineOnMigrate(properties.isBaselineOnMigrate()).baselineVersion(properties.getBaselineVersion())
                .locations("filesystem:" + resources.resolve("db/migration").toString().replace('\\', '/'))
                .load().migrate();
    }
}
