package dev.pumpwatch.connectors.finnhub;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

final class JdbcFinnhubState implements FinnhubState {
    private final JdbcTemplate jdbc;

    JdbcFinnhubState(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> get(String name) {
        return jdbc.queryForList("SELECT value FROM finnhub_state WHERE name = ?", String.class, name).stream()
                .findFirst();
    }

    @Override
    public void put(String name, String value) {
        jdbc.update("INSERT INTO finnhub_state (name, value) VALUES (?, ?) "
                + "ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", name, value);
    }
}
