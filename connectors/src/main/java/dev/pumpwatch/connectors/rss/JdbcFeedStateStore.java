package dev.pumpwatch.connectors.rss;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

/** Postgres-backed {@link FeedStateStore} on the {@code rss_feed_state} table. */
final class JdbcFeedStateStore implements FeedStateStore {
    private final JdbcTemplate jdbc;

    JdbcFeedStateStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<FeedState> get(String feedUrl) {
        return jdbc.query("SELECT etag, last_modified FROM rss_feed_state WHERE feed_url = ?",
                (rs, i) -> new FeedState(rs.getString(1), rs.getString(2)), feedUrl).stream().findFirst();
    }

    @Override
    public void save(String feedUrl, FeedState s) {
        jdbc.update("""
                INSERT INTO rss_feed_state (feed_url, etag, last_modified) VALUES (?, ?, ?)
                ON CONFLICT (feed_url) DO UPDATE
                SET etag = EXCLUDED.etag, last_modified = EXCLUDED.last_modified, updated_at = now()""",
                feedUrl, s.etag(), s.lastModified());
    }
}
