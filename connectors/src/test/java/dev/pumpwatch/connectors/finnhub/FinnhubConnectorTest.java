package dev.pumpwatch.connectors.finnhub;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.PumpwatchKafkaProperties;
import dev.pumpwatch.connectors.core.RateLimiter;
import dev.pumpwatch.connectors.core.SeenItems;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class FinnhubConnectorTest {
    static final String TOKEN = "tok-SECRET-123";
    static final String ARTICLE = """
            [{"category":"company","datetime":1767225600,"headline":"Press Release: GME Soars!","id":7001,
              "image":"","related":"gme, amc,","source":"X","summary":"s","url":"https://example.com/a"}]""";

    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    record Call(Instant at, URI uri, String token) {}

    record Sent(String topic, String key, String value) {}

    static final class MemoryState implements FinnhubState {
        final Map<String, String> m = new HashMap<>();
        @Override public Optional<String> get(String name) { return Optional.ofNullable(m.get(name)); }
        @Override public void put(String name, String value) { m.put(name, value); }
    }

    final MutableClock clock = new MutableClock();
    final MemoryState state = new MemoryState();
    final List<Call> calls = new ArrayList<>();
    final List<Sent> sent = new CopyOnWriteArrayList<>();
    final Set<String> seenIds = new HashSet<>();
    final SeenItems seen = new SeenItems(null) {
        @Override public boolean isSeen(String source, String itemId) { return seenIds.contains(source + ":" + itemId); }
        @Override public boolean markNew(String source, String itemId) { return seenIds.add(source + ":" + itemId); }
    };
    final ConnectorPublisher publisher = new ConnectorPublisher("finnhub", new dev.pumpwatch.connectors.core.InMemoryOutbox(), (t, k, v) -> {
        sent.add(new Sent(t, k, v));
        return CompletableFuture.completedFuture(null);
    }, PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());

    FinnhubConnector connector(int rpm, List<String> watchlist, Function<Call, FinnhubApi.Response> server) {
        var limiter = new RateLimiter(rpm, clock);
        // fake clock: instead of sleeping, move time forward until the limiter grants a token
        FinnhubApi.Pace pace = () -> {
            while (!limiter.tryAcquire()) clock.advance(Duration.ofMillis(100));
        };
        FinnhubApi.Http http = (uri, token) -> {
            var c = new Call(clock.instant(), uri, token);
            calls.add(c);
            return server.apply(c);
        };
        var api = new FinnhubApi(http, "https://finnhub.io", TOKEN, limiter, pace, clock);
        var props = new FinnhubProperties(true, TOKEN, rpm, Duration.ofMinutes(1), 2);
        publisher.start();
        return new FinnhubConnector(props, watchlist, publisher, api, seen, state, clock);
    }

    static FinnhubApi.Response ok(String body) {
        return new FinnhubApi.Response(200, body, null);
    }

    static List<String> tickers(int n) {
        return IntStream.range(0, n).mapToObj(i -> "T" + i).toList();
    }

    static String symbolOf(Call c) {
        var q = c.uri().getQuery();
        return q.startsWith("symbol=") ? q.substring(7, q.indexOf('&')) : null;
    }

    void awaitDrained() throws Exception {
        for (int i = 0; i < 200 && publisher.bufferSize() > 0; i++) Thread.sleep(10);
        Thread.sleep(50);
    }

    @Test
    void rateLimitIsNeverExceededForAWatchlistLargerThanOneCycleAllows() throws Exception {
        var c = connector(50, tickers(120), call -> ok("[]"));
        for (int i = 0; i < 6; i++) c.runCycle();

        assertThat(calls.stream().limit(50).filter(x -> symbolOf(x) == null)).hasSize(1); // general news leads cycle 1
        for (var x : calls) {
            long inWindow = calls.stream().filter(y -> !y.at().isAfter(x.at())
                    && y.at().isAfter(x.at().minusSeconds(60))).count();
            assertThat(inWindow).as("calls in the minute ending %s", x.at()).isLessThanOrEqualTo(50);
        }
        // 49 tickers per cycle: three cycles cover all 120, and fairness means nobody is starved or doubled early
        var firstThree = calls.stream().limit(150).map(FinnhubConnectorTest::symbolOf).filter(s -> s != null).toList();
        assertThat(new HashSet<>(firstThree)).containsExactlyInAnyOrderElementsOf(tickers(120));
    }

    @Test
    void rotationResumesFromTheStoredPosition() throws Exception {
        state.put(FinnhubConnector.POSITION, "5");
        var c = connector(4, tickers(10), call -> ok("[]")); // 4 calls per cycle = general + 3 tickers
        c.runCycle();
        assertThat(calls.stream().map(FinnhubConnectorTest::symbolOf).filter(s -> s != null).toList())
                .containsExactly("T5", "T6", "T7");
        assertThat(state.get(FinnhubConnector.POSITION)).contains("8");

        calls.clear();
        var restarted = connector(4, tickers(10), call -> ok("[]")); // new instance, same stored state
        restarted.runCycle();
        assertThat(calls.stream().map(FinnhubConnectorTest::symbolOf).filter(s -> s != null).toList())
                .containsExactly("T8", "T9", "T0");
        assertThat(state.get(FinnhubConnector.POSITION)).contains("1");
    }

    @Test
    void companyNewsUsesDateWindowAndTokenHeaderOnly() throws Exception {
        connector(50, List.of("GME"), call -> ok("[]")).runCycle();
        assertThat(calls.get(0).uri().toString()).isEqualTo("https://finnhub.io/api/v1/news?category=general");
        assertThat(calls.get(1).uri().toString())
                .isEqualTo("https://finnhub.io/api/v1/company-news?symbol=GME&from=2025-12-30&to=2026-01-01");
        assertThat(calls).extracting(Call::token).containsOnly(TOKEN);
        assertThat(calls).allSatisfy(x -> assertThat(x.uri().toString().toLowerCase()).doesNotContain("token"));
    }

    @Test
    void normalizesAnArticle() throws Exception {
        var rec = FinnhubApi.parse(ARTICLE, Instant.parse("2026-01-02T00:00:00Z")).get(0);
        assertThat(rec.source()).isEqualTo("finnhub");
        assertThat(rec.itemId()).isEqualTo("7001");
        assertThat(rec.headline()).isEqualTo("Press Release: GME Soars!");
        assertThat(rec.url()).isEqualTo("https://example.com/a");
        assertThat(rec.tickers()).containsExactly("GME", "AMC");
        assertThat(rec.fingerprint()).isEqualTo(Fingerprints.fingerprint("GME Soars"));
        assertThat(rec.eventTime()).isEqualTo(Instant.ofEpochSecond(1767225600L));
        assertThat(rec.ingestTime()).isEqualTo(Instant.parse("2026-01-02T00:00:00Z"));
        var none = FinnhubApi.parse(ARTICLE.replace("gme, amc,", ""), Instant.EPOCH).get(0);
        assertThat(none.tickers()).isEmpty();
    }

    @Test
    void duplicateIsPublishedOnceToRawNewsKeyedByItemId() throws Exception {
        var c = connector(50, List.of("GME"), call -> ok(ARTICLE)); // general and company news both return it
        c.runCycle();
        c.runCycle();
        awaitDrained();
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).topic()).isEqualTo(Topics.RAW_NEWS);
        assertThat(sent.get(0).key()).isEqualTo("7001");
        assertThat(Json.fromJson(sent.get(0).value(), ArticleRecord.class).itemId()).isEqualTo("7001");
    }

    @Test
    void a429PausesTheLimiterUntilTheRetryTime() throws Exception {
        var first = new boolean[] {true};
        var c = connector(50, List.of(), call -> {
            if (first[0]) {
                first[0] = false;
                return new FinnhubApi.Response(429, "", "30");
            }
            return ok("[]");
        });
        c.runCycle();
        assertThat(calls).hasSize(2);
        assertThat(Duration.between(calls.get(0).at(), calls.get(1).at())).isGreaterThanOrEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void tokenNeverAppearsInLogsOrUrls() throws Exception {
        var root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        root.addAppender(appender);
        try {
            var c = connector(50, tickers(3), call -> new FinnhubApi.Response(500, "{\"token\":\"" + TOKEN + "\"}", null));
            c.runCycle();
            assertThat(appender.list).isNotEmpty();
            assertThat(appender.list).allSatisfy(e -> assertThat(e.getFormattedMessage()).doesNotContain(TOKEN));
            assertThat(calls).allSatisfy(x -> assertThat(x.uri().toString()).doesNotContain(TOKEN));
            assertThat(new FinnhubProperties(true, TOKEN, 50, Duration.ofMinutes(1), 2).toString()).doesNotContain(TOKEN);
        } finally {
            root.detachAppender(appender);
        }
    }

    @Test
    void failsFastWhenEnabledWithoutAToken() {
        assertThatThrownBy(() -> FinnhubConnector.validate(
                new FinnhubProperties(true, " ", 50, Duration.ofMinutes(1), 2), List.of("GME")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("FINNHUB_TOKEN");
    }
}
