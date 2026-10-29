package dev.pumpwatch.replay;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Postgres-backed storage for recorded events. */
@Repository
public class EventStore implements EventSource {
    private final JdbcTemplate jdbc;

    public EventStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Batch insert; redelivered records hit the unique constraint and are skipped. */
    public void insertAll(List<RecordedEvent> events) {
        jdbc.batchUpdate(
                "INSERT INTO recorded_events (topic, record_key, event_time, payload, kafka_partition, kafka_offset)"
                        + " VALUES (?, ?, ?, ?, ?, ?)"
                        + " ON CONFLICT (topic, kafka_partition, kafka_offset) DO NOTHING",
                events, events.size(), (ps, e) -> {
                    ps.setString(1, e.topic());
                    ps.setString(2, e.key());
                    ps.setTimestamp(3, Timestamp.from(e.eventTime()));
                    ps.setString(4, e.payload());
                    ps.setInt(5, e.partition());
                    ps.setLong(6, e.offset());
                });
    }

    @Override
    public List<RecordedEvent> page(Instant from, Instant to, Instant afterTime, long afterId, int limit) {
        // keyset pagination on (event_time, id): stable and index-friendly
        return jdbc.query(
                "SELECT id, topic, record_key, event_time, payload, kafka_partition, kafka_offset FROM recorded_events"
                        + " WHERE event_time >= ? AND event_time < ? AND (event_time, id) > (?, ?)"
                        + " ORDER BY event_time, id LIMIT ?",
                (rs, i) -> new RecordedEvent(rs.getLong(1), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4).toInstant(), rs.getString(5), rs.getInt(6), rs.getLong(7)),
                Timestamp.from(from), Timestamp.from(to), Timestamp.from(afterTime), afterId, limit);
    }

    public long count() {
        return jdbc.queryForObject("SELECT count(*) FROM recorded_events", Long.class);
    }
}
