package dev.pumpwatch.api.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import dev.pumpwatch.api.Views;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Flag;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class AlertServiceTest {
    static final String SECRET = "https://hooks.example.com/services/T000/B000/SECRETTOKEN";
    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");

    static FlagView flag(long id, String ticker, Instant at, double score) {
        var e = new Flag.Evidence(score, "rules-1", List.of(new Flag.Contributor("chatter", 20)), 5, 2,
                new Flag.CatalystCheck(false, at.minusSeconds(3600), at, List.of()));
        return new FlagView(id, ticker, at, e);
    }

    /** In-memory store with the same dedupe contract as the SQL one. */
    static class FakeStore implements AlertStore {
        final List<FlagView> flags = new ArrayList<>();
        final Set<String> ledger = new HashSet<>();
        final Map<String, Instant> last = new HashMap<>();
        final List<Due> outbox = new ArrayList<>();
        final Map<Long, Instant> nextAt = new HashMap<>();
        final Map<Long, Integer> attempts = new HashMap<>();
        final Set<Long> sent = new HashSet<>();
        final Set<Long> failed = new HashSet<>();
        final List<Instant> singles = new ArrayList<>();
        long seq;

        public List<FlagView> pendingFlags(String ch, Instant since, int limit) {
            return flags.stream().filter(f -> !ledger.contains(ch + f.id()) && !f.raisedAt().isBefore(since)).toList();
        }
        public Map<String, Instant> lastAlerted(String ch) { return last; }
        public int singlesSince(String ch, Instant since) { return (int) singles.stream().filter(i -> !i.isBefore(since)).count(); }
        boolean decide(String ch, FlagView f, boolean alerted) {
            if (!ledger.add(ch + f.id())) return false;
            if (alerted) last.merge(f.ticker(), f.raisedAt(), (a, b) -> a.isAfter(b) ? a : b);
            return true;
        }
        void out(String ch, String payload, Instant now) {
            outbox.add(new Due(++seq, ch, payload, 0)); nextAt.put(seq, now); attempts.put(seq, 0);
        }
        public boolean enqueueSingle(String ch, FlagView f, String payload, Instant now) {
            if (!decide(ch, f, true)) return false;
            singles.add(now); out(ch, payload, now); return true;
        }
        public void enqueueDigest(String ch, List<FlagView> fs, String payload, Instant now) {
            boolean any = false;
            for (var f : fs) any |= decide(ch, f, true);
            if (any) out(ch, payload, now);
        }
        public void suppress(String ch, List<FlagView> fs) { fs.forEach(f -> decide(ch, f, false)); }
        public List<Due> due(Instant now, int limit) {
            return outbox.stream().filter(d -> !sent.contains(d.id()) && !failed.contains(d.id())
                    && !nextAt.get(d.id()).isAfter(now))
                    .map(d -> new Due(d.id(), d.channel(), d.payload(), attempts.get(d.id()))).toList();
        }
        public void markSent(long id, Instant now) { sent.add(id); }
        public void markFailed(long id, String err, Instant next) {
            attempts.merge(id, 1, Integer::sum);
            if (next == null) failed.add(id); else nextAt.put(id, next);
        }
    }

    static class MutableClock extends Clock {
        Instant now = T;
        public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(java.time.ZoneId z) { return this; }
        public Instant instant() { return now; }
    }

    static AlertProperties props(int maxPerMinute) {
        return new AlertProperties(true, List.of(SECRET), "http://localhost:3000/", Duration.ofMinutes(30),
                maxPerMinute, 3, Duration.ofSeconds(5), Duration.ofMinutes(1), Duration.ofHours(1));
    }

    @Test
    void temporaryFailureIsRetriedWithBackoffAndDeliveredExactlyOnce() {
        var store = new FakeStore();
        store.flags.add(flag(1, "GME", T, 72));
        var clock = new MutableClock();
        var posts = new ArrayList<String>();
        int[] calls = {0};
        WebhookSender sender = (url, msg) -> { posts.add(msg); return ++calls[0] == 1 ? 503 : 200; };
        var svc = new AlertService(store, sender, props(5), clock);

        svc.tick();
        assertThat(posts).hasSize(1);
        svc.tick(); // still inside backoff
        assertThat(posts).hasSize(1);
        clock.now = T.plusSeconds(6);
        svc.tick();
        svc.tick();
        svc.tick(); // flag already decided: no second message
        assertThat(posts).hasSize(2);
        assertThat(store.sent).hasSize(1);
        assertThat(store.outbox).hasSize(1);
    }

    @Test
    void givesUpAfterMaxAttempts() {
        var store = new FakeStore();
        store.flags.add(flag(1, "GME", T, 72));
        var clock = new MutableClock();
        var svc = new AlertService(store, (u, m) -> 500, props(5), clock);
        for (int i = 0; i < 5; i++) { svc.tick(); clock.now = clock.now.plus(Duration.ofMinutes(2)); }
        assertThat(store.failed).hasSize(1);
        assertThat(store.attempts.get(1L)).isEqualTo(3);
    }

    @Test
    void burstBecomesOneDigestAndCooldownSuppressesSameTicker() {
        var store = new FakeStore();
        store.flags.add(flag(1, "AAA", T, 70));
        store.flags.add(flag(2, "BBB", T, 71));
        store.flags.add(flag(3, "CCC", T, 72));
        store.flags.add(flag(4, "DDD", T, 73));
        store.flags.add(flag(5, "AAA", T.plusSeconds(60), 90)); // inside AAA cooldown
        var posts = new ArrayList<String>();
        new AlertService(store, (u, m) -> { posts.add(m); return 204; }, props(2), new MutableClock()).tick();
        assertThat(posts).hasSize(3); // 2 singles + 1 digest
        assertThat(posts.get(2)).contains("digest").contains("CCC 72").contains("DDD 73").doesNotContain("AAA 90");
    }

    @Test
    void everyMessageCarriesNoticeAndModelVersion() {
        var store = new FakeStore();
        store.flags.add(flag(1, "GME", T, 72));
        store.flags.add(flag(2, "AMC", T, 71));
        store.flags.add(flag(3, "SNDL", T, 70));
        var posts = new ArrayList<String>();
        new AlertService(store, (u, m) -> { posts.add(m); return 200; }, props(2), new MutableClock()).tick();
        assertThat(posts).hasSize(3).allSatisfy(m -> assertThat(m).contains(Views.NOTICE).contains("rules-1"));
        assertThat(posts.get(0)).contains("GME").contains("72").contains("http://localhost:3000/api/v1/tickers/GME/timeline");
    }

    @Test
    void webhookUrlNeverReachesLogsOrStoredRecords() {
        var logger = (Logger) LoggerFactory.getLogger("dev.pumpwatch.api");
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        try {
            var store = new FakeStore();
            store.flags.add(flag(1, "GME", T, 72));
            // a transport error whose message contains the URL, as URI/IO exceptions do
            WebhookSender sender = (url, msg) -> { throw new IllegalArgumentException("bad uri " + url); };
            var svc = new AlertService(store, sender, props(5), new MutableClock());
            svc.tick();
            svc.tick();
            assertThat(props(5).toString()).doesNotContain("SECRETTOKEN");
            var logged = appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
            assertThat(logged).isNotEmpty().noneMatch(l -> l.contains("SECRETTOKEN") || l.contains("hooks.example.com"));
            assertThat(store.outbox).noneMatch(d -> d.payload().contains("SECRETTOKEN") || d.channel().contains("hooks"));
            assertThat(store.ledger).noneMatch(k -> k.contains("SECRETTOKEN"));
        } finally {
            logger.detachAppender(appender);
        }
    }
}
