package dev.pumpwatch.connectors.alpacanews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.connectors.alpaca.HttpTradeHistory;
import dev.pumpwatch.connectors.alpaca.TradeStream;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.NewsSink;
import dev.pumpwatch.connectors.core.PumpwatchKafkaProperties;
import dev.pumpwatch.connectors.core.RateLimiter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

class AlpacaNewsSourceTest {
    static final String KEY = "PKTESTKEYID123";
    static final String SECRET = "s3cr3t-value-xyz";
    static final Instant NOW = Instant.parse("2026-01-02T16:00:00Z");
    static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);
    static final ObjectMapper M = Json.newMapper();
    static final NewsHistory NO_HISTORY = (sy, a, b, tok) -> new NewsHistory.Page(List.of(), null);

    record Sent(String topic, String key, String value) {}

    final List<Sent> sent = new CopyOnWriteArrayList<>();
    final ConnectorPublisher publisher = new ConnectorPublisher("alpaca-news", new dev.pumpwatch.connectors.core.InMemoryOutbox(),
            (t, k, v) -> {
                sent.add(new Sent(t, k, v));
                return CompletableFuture.completedFuture(null);
            }, PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());
    final HashSet<String> seen = new HashSet<>();
    final NewsSink sink = new NewsSink(publisher, (s, i) -> seen.contains(s + "|" + i), (s, i) -> seen.add(s + "|" + i), () -> false);

    /** Scripted server: connected/auth/subscribe handshake, then the frames for this connection, then close. */
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
                        l.onText(this, "[{\"T\":\"subscription\",\"news\":[\"*\"]}]");
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

    static String news(long id, String headline, String createdAt, String... symbols) {
        var syms = new ArrayList<String>();
        for (var s : symbols) syms.add("\"" + s + "\"");
        return "{\"T\":\"n\",\"id\":" + id + ",\"headline\":\"" + headline + "\",\"summary\":\"s\",\"author\":\"a\","
                + "\"created_at\":\"" + createdAt + "\",\"updated_at\":\"" + createdAt + "\",\"url\":\"https://x.test/" + id
                + "\",\"symbols\":[" + String.join(",", syms) + "],\"source\":\"benzinga\"}";
    }

    static AlpacaNewsProperties props(boolean all) {
        return new AlpacaNewsProperties(true, 150, KEY, SECRET, all, 60);
    }

    AlpacaNewsSource source(FakeStream s, NewsHistory h, boolean all, List<String> watchlist) {
        publisher.start();
        return new AlpacaNewsSource(props(all), watchlist, s, h, CLOCK);
    }

    List<ArticleRecord> articles() throws InterruptedException {
        Thread.sleep(300); // publisher thread drains asynchronously
        return sent.stream().map(x -> Json.fromJson(x.value(), ArticleRecord.class)).toList();
    }

    @Test
    void articleWithSymbolsIsNormalizedAndKeyedByItemId() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of("[" + news(77, "ABCD Announces Deal", "2026-01-02T15:04:05Z", "abcd", "EFG", "BTC/USD") + "]"));
        source(s, NO_HISTORY, true, List.of()).run(sink);

        assertThat(s.clientFrames.get(0)).contains("\"action\":\"auth\"").contains(KEY).contains(SECRET);
        assertThat(s.clientFrames.get(1)).isEqualTo("{\"action\":\"subscribe\",\"news\":[\"*\"]}");
        var a = articles().get(0);
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).topic()).isEqualTo(Topics.RAW_NEWS);
        assertThat(sent.get(0).key()).isEqualTo("77");
        assertThat(a.source()).isEqualTo("alpaca");
        assertThat(a.itemId()).isEqualTo("77");
        assertThat(a.headline()).isEqualTo("ABCD Announces Deal");
        assertThat(a.url()).isEqualTo("https://x.test/77");
        assertThat(a.tickers()).containsExactly("ABCD", "EFG"); // upper case, invalid "BTC/USD" dropped
        assertThat(a.fingerprint()).isEqualTo(Fingerprints.fingerprint("ABCD Announces Deal"));
        assertThat(a.eventTime()).isEqualTo(Instant.parse("2026-01-02T15:04:05Z"));
        assertThat(a.ingestTime()).isEqualTo(NOW);
        assertThat(Validator.validate(a)).isEmpty();
    }

    @Test
    void subscribesToWatchlistWhenNotSubscribingToAll() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of());
        source(s, NO_HISTORY, false, List.of("GME", " amc ", "GME")).run(sink);
        assertThat(s.clientFrames.get(1)).isEqualTo("{\"action\":\"subscribe\",\"news\":[\"GME\",\"AMC\"]}");
    }

    @Test
    void duplicateItemIsPublishedOnce() throws Exception {
        var s = new FakeStream();
        var n = news(5, "Same", "2026-01-02T15:00:00Z", "GME");
        s.connections.add(List.of("[" + n + "]", "[" + n + "]"));
        source(s, NO_HISTORY, true, List.of()).run(sink);
        assertThat(articles()).hasSize(1);
    }

    @Test
    void backfillsOnFirstConnectionAndGapFillsFromLastSeenAfterReconnect() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of("[" + news(1, "One", "2026-01-02T15:00:01Z", "GME") + "]"));
        s.connections.add(List.of("[" + news(4, "Four", "2026-01-02T15:00:04Z", "GME") + "]"));
        var asked = new ArrayList<Instant>();
        NewsHistory history = (sy, start, end, tok) -> {
            asked.add(start);
            if (asked.size() == 1) return new NewsHistory.Page(List.of(), null);
            // item 1 (boundary) and 4 (also seen live) come back again; 2 and 3 were missed
            return new NewsHistory.Page(List.of(item(1, "2026-01-02T15:00:01Z"), item(2, "2026-01-02T15:00:02Z"),
                    item(3, "2026-01-02T15:00:03Z"), item(4, "2026-01-02T15:00:04Z")), null);
        };
        var src = source(s, history, true, List.of());
        src.run(sink);
        src.run(sink);

        assertThat(asked).containsExactly(NOW.minusSeconds(3600), Instant.parse("2026-01-02T15:00:01Z"));
        assertThat(articles()).extracting(ArticleRecord::itemId).containsExactlyInAnyOrder("1", "2", "3", "4");
    }

    @Test
    void gapFillFollowsPagination() throws Exception {
        var s = new FakeStream();
        s.connections.add(List.of());
        var tokens = new ArrayList<String>();
        NewsHistory history = (sy, start, end, tok) -> {
            tokens.add(tok);
            return tok == null ? new NewsHistory.Page(List.of(item(1, "2026-01-02T15:00:01Z")), "t1")
                    : new NewsHistory.Page(List.of(item(2, "2026-01-02T15:00:02Z")), null);
        };
        source(s, history, true, List.of()).run(sink);
        assertThat(tokens).containsExactly(null, "t1");
        assertThat(articles()).extracting(ArticleRecord::itemId).containsExactly("1", "2");
    }

    @Test
    void failedAuthEndsTheRunWithAnError() {
        var s = new TradeStream() {
            @Override
            public Connection open(URI uri, Listener l) {
                Connection c = new Connection() {
                    @Override public void send(String text) {}
                    @Override public void close() {}
                };
                l.onText(c, "[{\"T\":\"error\",\"code\":402,\"msg\":\"auth failed\"}]");
                l.onClose("closed");
                return c;
            }
        };
        publisher.start();
        assertThatThrownBy(() -> new AlpacaNewsSource(props(true), List.of(), s, NO_HISTORY, CLOCK).run(sink))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void blankCredentialsAndEmptyWatchlistFail() {
        assertThatThrownBy(() -> AlpacaNewsSource.validate(new AlpacaNewsProperties(true, 150, " ", SECRET, true, 60), List.of()))
                .hasMessageContaining("ALPACA_KEY_ID");
        assertThatThrownBy(() -> AlpacaNewsSource.validate(props(false), List.of(" ")))
                .hasMessageContaining("watchlist");
        assertThat(props(true).toString()).doesNotContain(KEY).doesNotContain(SECRET);
    }

    // --- REST client ---

    @Test
    void restClientSendsParamsAndCredentialsAndRetriesOn429() throws Exception {
        var uris = new ArrayList<URI>();
        var headers = new ArrayList<String>();
        var calls = new int[1];
        HttpTradeHistory.Http http = (uri, key, secret) -> {
            uris.add(uri);
            headers.add(key + "/" + secret);
            return calls[0]++ == 0 ? new HttpTradeHistory.Response(429, "", "1")
                    : new HttpTradeHistory.Response(200, "{\"news\":[" + news(9, "Nine", "2026-01-02T15:00:00Z", "GME")
                            + "],\"next_page_token\":\"tok2\"}", null);
        };
        var h = new HttpNewsHistory(http, "https://data.alpaca.markets", KEY, SECRET,
                new RateLimiter(6000, Clock.systemUTC()), Clock.systemUTC()); // 429 pause needs a moving clock
        var page = h.news(List.of("GME", "AMC"), NOW.minusSeconds(60), NOW, "tok1");

        assertThat(page.nextPageToken()).isEqualTo("tok2");
        assertThat(page.articles()).hasSize(1);
        assertThat(uris).hasSize(2);
        var q = uris.get(1).toString();
        assertThat(q).startsWith("https://data.alpaca.markets/v1beta1/news?symbols=GME%2CAMC")
                .contains("start=2026-01-02T15%3A59%3A00Z").contains("end=2026-01-02T16%3A00%3A00Z")
                .contains("limit=50").contains("page_token=tok1").contains("sort=asc");
        assertThat(headers).containsOnly(KEY + "/" + SECRET);
    }

    @Test
    void restClientFailsOnNon200WithoutLeakingCredentials() {
        HttpTradeHistory.Http http = (uri, key, secret) -> new HttpTradeHistory.Response(500, "oops", null);
        var h = new HttpNewsHistory(http, "https://data.alpaca.markets", KEY, SECRET, new RateLimiter(6000, CLOCK), CLOCK);
        assertThatThrownBy(() -> h.news(List.of(), NOW.minusSeconds(60), NOW, null))
                .hasMessageContaining("500").satisfies(e -> assertThat(e.getMessage()).doesNotContain(KEY));
    }

    static com.fasterxml.jackson.databind.JsonNode item(long id, String createdAt) {
        try {
            return M.readTree(news(id, "Item " + id, createdAt, "GME"));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
