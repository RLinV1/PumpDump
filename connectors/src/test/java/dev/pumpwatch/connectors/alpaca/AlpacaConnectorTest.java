package dev.pumpwatch.connectors.alpaca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.PumpwatchKafkaProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class AlpacaConnectorTest {
    static final String KEY = "PKTESTKEYID123";
    static final String SECRET = "s3cr3t-value-xyz";
    static final TradeHistory NO_HISTORY = (sy, a, b, tok) -> new TradeHistory.Page(List.of(), null);

    record Sent(String topic, String key, String value) {}

    final List<Sent> sent = new CopyOnWriteArrayList<>();
    final ConnectorPublisher publisher = new ConnectorPublisher("alpaca",
            (t, k, v) -> {
                sent.add(new Sent(t, k, v));
                return CompletableFuture.completedFuture(null);
            }, PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());

    /** Scripted server: answers connected/auth/subscribe, then plays the frames for this connection and closes. */
    static class FakeStream implements TradeStream {
        final List<String> clientFrames = new ArrayList<>();
        final List<List<String>> connections = new ArrayList<>();
        int opened;

        @Override
        public Connection open(URI uri, Listener l) {
            var script = connections.get(opened++);
            Connection c = new Connection() {
                @Override
                public void send(String text) {
                    clientFrames.add(text);
                    if (text.contains("\"auth\"")) {
                        l.onText(this, "[{\"T\":\"success\",\"msg\":\"authenticated\"}]");
                    } else {
                        l.onText(this, "[{\"T\":\"subscription\",\"trades\":[\"GME\"]}]");
                        script.forEach(f -> l.onText(this, f));
                        l.onClose("test close");
                    }
                }

                @Override
                public void close() {}
            };
            l.onText(c, "[{\"T\":\"success\",\"msg\":\"connected\"}]");
            return c;
        }
    }

    static String trade(String sym, String price, int size, String time, long id) {
        return "{\"T\":\"t\",\"S\":\"" + sym + "\",\"p\":" + price + ",\"s\":" + size + ",\"t\":\"" + time
                + "\",\"x\":\"V\",\"i\":" + id + "}";
    }

    static Trade t(String sym, String time, long id) {
        return new Trade(sym, new BigDecimal("10.5"), 100, Instant.parse(time), "V", Long.toString(id));
    }

    static AlpacaProperties props(int limit, String key, String secret) {
        return new AlpacaProperties(true, 150, "free", "iex", limit, key, secret);
    }

    AlpacaConnector connector(FakeStream s, TradeHistory h, List<String> watchlist) {
        var seen = new HashSet<String>();
        publisher.start();
        return new AlpacaConnector(props(30, KEY, SECRET), watchlist, publisher, s, h, seen::add, Clock.systemUTC());
    }

    List<TickRecord> ticks() throws InterruptedException {
        Thread.sleep(300); // publisher thread drains asynchronously
        return sent.stream().map(x -> Json.fromJson(x.value(), TickRecord.class)).toList();
    }

    @Test
    void parsesTradeAndSubscribesToWatchlist() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of("[" + trade("GME", "21.37", 50, "2026-01-02T15:04:05.123456789Z", 7) + "]"));
        var c = connector(s, NO_HISTORY, List.of("GME", " amc ", "GME"));
        c.session();

        assertThat(s.clientFrames.get(1)).isEqualTo("{\"action\":\"subscribe\",\"trades\":[\"GME\",\"AMC\"]}");
        var tick = ticks().get(0);
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).topic()).isEqualTo(Topics.TICKS);
        assertThat(sent.get(0).key()).isEqualTo("GME");
        assertThat(tick.ticker()).isEqualTo("GME");
        assertThat(tick.price()).isEqualByComparingTo("21.37");
        assertThat(tick.size()).isEqualTo(50);
        assertThat(tick.exchange()).isEqualTo("V");
        assertThat(tick.eventTime()).isEqualTo(Instant.parse("2026-01-02T15:04:05.123456789Z"));
        assertThat(tick.ingestTime()).isAfter(tick.eventTime());
    }

    @Test
    void keepsOrderPerTicker() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of("[" + trade("GME", "1", 1, "2026-01-02T15:00:01Z", 1) + ","
                + trade("AMC", "2", 1, "2026-01-02T15:00:02Z", 2) + ","
                + trade("GME", "3", 1, "2026-01-02T15:00:03Z", 3) + "]"));
        connector(s, NO_HISTORY, List.of("GME", "AMC")).session();
        var gme = ticks().stream().filter(x -> x.ticker().equals("GME")).map(x -> x.price().intValue()).toList();
        assertThat(gme).containsExactly(1, 3);
    }

    @Test
    void overLimitWatchlistFailsNamingTheLimit() {
        assertThatThrownBy(() -> AlpacaConnector.validate(props(2, KEY, SECRET), List.of("A", "B", "C")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("limit is 2");
    }

    @Test
    void blankCredentialsFail() {
        assertThatThrownBy(() -> AlpacaConnector.validate(props(30, " ", SECRET), List.of("GME")))
                .hasMessageContaining("ALPACA_KEY_ID");
        assertThatThrownBy(() -> AlpacaConnector.validate(props(30, KEY, null), List.of("GME")))
                .hasMessageContaining("ALPACA_SECRET_KEY");
    }

    @Test
    void gapFillAfterReconnectPublishesMissedTradesOnceAndSkipsDuplicates() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of("[" + trade("GME", "1", 1, "2026-01-02T15:00:01Z", 1) + "]"));
        s.connections.add(List.of("[" + trade("GME", "4", 1, "2026-01-02T15:00:04Z", 4) + "]"));
        var asked = new ArrayList<Instant>();
        TradeHistory history = (sy, start, end, tok) -> {
            asked.add(start);
            // trade 1 (boundary) and 4 (also seen live) come back again; 2 and 3 were missed
            return new TradeHistory.Page(List.of(t("GME", "2026-01-02T15:00:01Z", 1), t("GME", "2026-01-02T15:00:02Z", 2),
                    t("GME", "2026-01-02T15:00:03Z", 3), t("GME", "2026-01-02T15:00:04Z", 4)), null);
        };
        var c = connector(s, history, List.of("GME"));
        c.session();
        assertThat(asked).isEmpty(); // first connection: nothing to fill
        c.session();

        assertThat(asked).containsExactly(Instant.parse("2026-01-02T15:00:01Z"));
        assertThat(ticks()).extracting(x -> x.eventTime().toString())
                .containsExactlyInAnyOrder("2026-01-02T15:00:01Z", "2026-01-02T15:00:02Z", "2026-01-02T15:00:03Z",
                        "2026-01-02T15:00:04Z");
    }

    @Test
    void backoffGrowsAndIsCapped() {
        assertThat(AlpacaConnector.backoff(0).toSeconds()).isEqualTo(1);
        assertThat(AlpacaConnector.backoff(3).toSeconds()).isEqualTo(8);
        assertThat(AlpacaConnector.backoff(50).toSeconds()).isEqualTo(60);
    }

    @Test
    void credentialsNeverAppearInLogsOrRecords() throws Exception {
        var root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        var previous = root.getLevel();
        root.setLevel(Level.ALL);
        root.addAppender(appender);
        try {
            var s = new FakeStream();
            s.connections.add(List.of("[{\"T\":\"error\",\"code\":402,\"msg\":\"auth failed\"}]",
                    "not json", "[" + trade("GME", "1", 1, "2026-01-02T15:00:01Z", 1) + "]"));
            var c = connector(s, NO_HISTORY, List.of("GME"));
            c.session();
            ticks();
            assertThat(s.clientFrames.get(0)).contains(KEY).contains(SECRET); // sent to Alpaca only
        } finally {
            root.detachAppender(appender);
            root.setLevel(previous);
        }
        var logs = new ArrayList<String>();
        appender.list.forEach(e -> {
            logs.add(e.getFormattedMessage());
            if (e.getThrowableProxy() != null) logs.add(e.getThrowableProxy().getMessage());
        });
        assertThat(logs).isNotEmpty().noneMatch(l -> l.contains(KEY) || l.contains(SECRET));
        assertThat(sent).noneMatch(x -> x.value().contains(KEY) || x.value().contains(SECRET));
        assertThat(props(30, KEY, SECRET).toString()).doesNotContain(KEY).doesNotContain(SECRET);
    }
}
