package dev.pumpwatch.api.alerts;

import dev.pumpwatch.api.RunIds;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class JdbcAlertStore implements AlertStore {
    private final JdbcTemplate jdbc;

    JdbcAlertStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<FlagView> pendingFlags(String channel, Instant since, int limit) {
        // run_id = 'live' is the only filter that matters: replayed flags never alert.
        return jdbc.query("""
                SELECT f.id, f.ticker, f.raised_at, f.evidence FROM api_flags f
                WHERE f.run_id = ? AND f.raised_at >= ?
                  AND NOT EXISTS (SELECT 1 FROM alert_flags a WHERE a.channel = ? AND a.flag_id = f.id)
                ORDER BY f.id LIMIT ?""",
                (rs, i) -> new FlagView(rs.getLong("id"), rs.getString("ticker"), rs.getTimestamp("raised_at").toInstant(),
                        Json.fromJson(rs.getString("evidence"), Flag.Evidence.class)),
                RunIds.LIVE, Timestamp.from(since), channel, limit);
    }

    @Override
    public Map<String, Instant> lastAlerted(String channel) {
        var out = new HashMap<String, Instant>();
        jdbc.query("""
                SELECT ticker, MAX(raised_at) AS at FROM alert_flags
                WHERE channel = ? AND outcome <> 'suppressed' GROUP BY ticker""",
                rs -> {
                    out.put(rs.getString("ticker"), rs.getTimestamp("at").toInstant());
                }, channel);
        return out;
    }

    @Override
    public int singlesSince(String channel, Instant since) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM alert_outbox WHERE channel = ? AND kind = 'flag' AND created_at >= ?",
                Integer.class, channel, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    @Override
    @Transactional
    public boolean enqueueSingle(String channel, FlagView flag, String payload, Instant now) {
        if (!decide(channel, flag, "queued")) return false;
        outbox(channel, "flag", payload, now);
        return true;
    }

    @Override
    @Transactional
    public void enqueueDigest(String channel, List<FlagView> flags, String payload, Instant now) {
        boolean any = false;
        for (FlagView f : flags) any |= decide(channel, f, "digested");
        if (any) outbox(channel, "digest", payload, now);
    }

    @Override
    @Transactional
    public void suppress(String channel, List<FlagView> flags) {
        flags.forEach(f -> decide(channel, f, "suppressed"));
    }

    private boolean decide(String channel, FlagView f, String outcome) {
        return jdbc.update("""
                INSERT INTO alert_flags (channel, flag_id, ticker, raised_at, outcome) VALUES (?,?,?,?,?)
                ON CONFLICT (channel, flag_id) DO NOTHING""",
                channel, f.id(), f.ticker(), Timestamp.from(f.raisedAt()), outcome) == 1;
    }

    private void outbox(String channel, String kind, String payload, Instant now) {
        jdbc.update("""
                INSERT INTO alert_outbox (channel, kind, payload, next_attempt_at, created_at) VALUES (?,?,?,?,?)""",
                channel, kind, payload, Timestamp.from(now), Timestamp.from(now));
    }

    @Override
    public List<Due> due(Instant now, int limit) {
        return jdbc.query("""
                SELECT id, channel, payload, attempts FROM alert_outbox
                WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT ?""",
                (rs, i) -> new Due(rs.getLong("id"), rs.getString("channel"), rs.getString("payload"),
                        rs.getInt("attempts")),
                Timestamp.from(now), limit);
    }

    @Override
    public void markSent(long id, Instant now) {
        jdbc.update("UPDATE alert_outbox SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL "
                + "WHERE id = ?", Timestamp.from(now), id);
    }

    @Override
    public void markFailed(long id, String error, Instant nextAttempt) {
        if (nextAttempt == null) {
            jdbc.update("UPDATE alert_outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?",
                    error, id);
        } else {
            jdbc.update("UPDATE alert_outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? "
                    + "WHERE id = ?", error, Timestamp.from(nextAttempt), id);
        }
    }
}
