package dev.pumpwatch.connectors.core;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** {@link OutboxStore} on the {@code outbox} table. */
@Component
public class JdbcOutboxStore implements OutboxStore {
    private final JdbcTemplate jdbc;

    public JdbcOutboxStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long count(String connector) {
        return jdbc.queryForObject("SELECT count(*) FROM outbox WHERE connector = ?", Long.class, connector);
    }

    @Override
    public void add(String connector, String topic, String key, String payload) {
        jdbc.update("INSERT INTO outbox (connector, topic, record_key, payload) VALUES (?, ?, ?, ?)",
                connector, topic, key, payload);
    }

    @Override
    public List<Row> oldest(String connector, int limit) {
        return jdbc.query("SELECT id, topic, record_key, payload FROM outbox WHERE connector = ? ORDER BY id LIMIT ?",
                (rs, i) -> new Row(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4)), connector, limit);
    }

    @Override
    public void delete(List<Long> ids) {
        if (ids.isEmpty()) return;
        jdbc.update("DELETE FROM outbox WHERE id = ANY (?)",
                ps -> ps.setArray(1, ps.getConnection().createArrayOf("bigint", ids.toArray())));
    }
}
