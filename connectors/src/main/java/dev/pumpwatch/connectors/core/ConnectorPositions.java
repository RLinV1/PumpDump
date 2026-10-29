package dev.pumpwatch.connectors.core;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Durable "where did this connector's stream stop?" value, one per source, in the {@code connector_positions} table. */
@Component
public class ConnectorPositions {
    private final JdbcTemplate jdbc;

    public ConnectorPositions(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The saved position, or null if the source never saved one. */
    public String load(String source) {
        return jdbc.query("SELECT position FROM connector_positions WHERE source = ?",
                (rs, i) -> rs.getString(1), source).stream().findFirst().orElse(null);
    }

    public void save(String source, String value) {
        jdbc.update("INSERT INTO connector_positions (source, position) VALUES (?, ?)"
                + " ON CONFLICT (source) DO UPDATE SET position = EXCLUDED.position, updated_at = now()", source, value);
    }
}
