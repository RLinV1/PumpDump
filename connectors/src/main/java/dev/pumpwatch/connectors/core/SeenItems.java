package dev.pumpwatch.connectors.core;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Durable "have we published this already?" check backed by the {@code seen_items} table, so restarts and
 * re-polls never publish an item twice.
 */
@Component
public class SeenItems {
    private final JdbcTemplate jdbc;

    public SeenItems(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Cheap read-only check; the durable mark comes from {@link #markNew} once the item was accepted for publishing. */
    public boolean isSeen(String source, String itemId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM seen_items WHERE source = ? AND item_id = ?)", Boolean.class, source, itemId));
    }

    /** Records the item and returns true the first time it is seen, false on every later call. */
    public boolean markNew(String source, String itemId) {
        return jdbc.update(
                "INSERT INTO seen_items (source, item_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                source, itemId) == 1;
    }

    /** True if the item was already recorded. Pair with {@link #markNew} after a successful publish. */
    public boolean isSeen(String source, String itemId) {
        return !jdbc.queryForList("SELECT 1 FROM seen_items WHERE source = ? AND item_id = ?", Integer.class, source,
                itemId).isEmpty();
    }
}
