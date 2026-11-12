package dev.pumpwatch.api;

import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.api.Views.ScoreView;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Swing;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Repository;

@Repository
public class ReadRepository {
    private final JdbcTemplate jdbc;

    public ReadRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Idempotent: the same run, ticker, window and model is stored once, whatever the Kafka offset. */
    public void saveScore(String runId, String topic, int partition, long offset, Score s) {
        jdbc.update("""
                INSERT INTO api_scores (run_id, topic, kafka_partition, kafka_offset, ticker, window_end, score,
                                        model_version, stale_sources, ingest_time, swing)
                VALUES (?,?,?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT (run_id, ticker, window_end, model_version) DO NOTHING""",
                runId, topic, partition, offset, s.ticker(), Timestamp.from(s.windowEnd()), s.score(),
                s.modelVersion(), String.join(",", new TreeSet<>(s.staleSources())), Timestamp.from(s.ingestTime()),
                s.swing() == null ? null : Json.toJson(s.swing()));
    }

    public void saveFlag(String runId, String topic, int partition, long offset, Flag f) {
        jdbc.update("""
                INSERT INTO api_flags (run_id, topic, kafka_partition, kafka_offset, ticker, raised_at, evidence)
                VALUES (?,?,?,?,?,?,?::jsonb) ON CONFLICT (run_id, ticker, raised_at) DO NOTHING""",
                runId, topic, partition, offset, f.ticker(), Timestamp.from(f.raisedAt()), Json.toJson(f.evidence()));
    }

    /** Only the run's last day of scores is scanned, measured from its newest row so replay runs work too. */
    public List<ScoreView> latestScores(String runId) {
        return jdbc.query("""
                SELECT DISTINCT ON (ticker) ticker, score, model_version, window_end, ingest_time, stale_sources, swing
                FROM api_scores
                WHERE run_id = ? AND window_end > (SELECT MAX(window_end) FROM api_scores WHERE run_id = ?) - interval '1 day'
                ORDER BY ticker, window_end DESC, id DESC""", SCORE, runId, runId);
    }

    static final int SCORE_RETENTION_DAYS = 7;

    /** Live scores older than a week are never read; replay runs are left alone. */
    @Scheduled(cron = "0 17 3 * * *")
    public int purgeOldLiveScores() {
        return jdbc.update("DELETE FROM api_scores WHERE run_id = 'live' AND window_end < now() - make_interval(days => ?)",
                SCORE_RETENTION_DAYS);
    }

    public List<ScoreView> scores(String runId, String ticker, Instant from, Instant to) {
        return jdbc.query("""
                SELECT ticker, score, model_version, window_end, ingest_time, stale_sources, swing
                FROM api_scores WHERE run_id = ? AND ticker = ? AND window_end >= ? AND window_end <= ?
                ORDER BY window_end, id""", SCORE, runId, ticker, Timestamp.from(from), Timestamp.from(to));
    }

    public List<FlagView> flags(String runId, String ticker, Instant from, Instant to) {
        return jdbc.query("""
                SELECT id, ticker, raised_at, evidence, (SELECT s.swing FROM api_scores s WHERE s.run_id = api_flags.run_id AND s.ticker = api_flags.ticker AND s.window_end <= api_flags.raised_at ORDER BY s.window_end DESC, s.id DESC LIMIT 1) AS swing FROM api_flags
                WHERE run_id = ? AND ticker = ? AND raised_at >= ? AND raised_at <= ? ORDER BY raised_at, id""",
                FLAG, runId, ticker, Timestamp.from(from), Timestamp.from(to));
    }

    /** Newest first. */
    public List<FlagView> recentFlags(String runId, int limit) {
        return jdbc.query("""
                SELECT id, ticker, raised_at, evidence, (SELECT s.swing FROM api_scores s WHERE s.run_id = api_flags.run_id AND s.ticker = api_flags.ticker AND s.window_end <= api_flags.raised_at ORDER BY s.window_end DESC, s.id DESC LIMIT 1) AS swing FROM api_flags WHERE run_id = ?
                ORDER BY raised_at DESC, id DESC LIMIT ?""", FLAG, runId, limit);
    }

    /** Oldest first, for the stream and Last-Event-ID resume. */
    public List<FlagView> flagsAfter(String runId, long afterId, int limit) {
        return jdbc.query("""
                SELECT id, ticker, raised_at, evidence, (SELECT s.swing FROM api_scores s WHERE s.run_id = api_flags.run_id AND s.ticker = api_flags.ticker AND s.window_end <= api_flags.raised_at ORDER BY s.window_end DESC, s.id DESC LIMIT 1) AS swing FROM api_flags WHERE run_id = ? AND id > ?
                ORDER BY id LIMIT ?""", FLAG, runId, afterId, limit);
    }

    public long maxFlagId(String runId) {
        Long id = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM api_flags WHERE run_id = ?", Long.class, runId);
        return id == null ? 0 : id;
    }

    private static final RowMapper<ScoreView> SCORE = (rs, i) -> {
        String stale = rs.getString("stale_sources");
        Set<String> sources = stale.isEmpty() ? Set.of() : Arrays.stream(stale.split(",")).collect(Collectors.toSet());
        return new ScoreView(rs.getString("ticker"), rs.getDouble("score"), rs.getString("model_version"),
                rs.getTimestamp("window_end").toInstant(), rs.getTimestamp("ingest_time").toInstant(), sources, swing(rs.getString("swing")));
    };

    private static final RowMapper<FlagView> FLAG = (rs, i) -> new FlagView(rs.getLong("id"), rs.getString("ticker"),
            rs.getTimestamp("raised_at").toInstant(), Json.fromJson(rs.getString("evidence"), Flag.Evidence.class),
            swing(rs.getString("swing")));

    private static Swing swing(String json) {
        return json == null ? null : Json.fromJson(json, Swing.class);
    }
}
