package dev.pumpwatch.connectors.rss;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.NewsSink;
import dev.pumpwatch.connectors.core.PumpwatchKafkaProperties;
import dev.pumpwatch.connectors.core.RateLimiter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RssSourceTest {
    static final String FEED = "https://www.prnewswire.com/rss/news.xml";
    static final String FEED2 = "https://rss.globenewswire.com/feed.xml";
    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-01-02T16:00:00Z"), java.time.ZoneOffset.UTC);

    record Sent(String topic, String key, String value) {}

    final List<Sent> sent = new CopyOnWriteArrayList<>();
    final ConnectorPublisher publisher = new ConnectorPublisher("rss", new dev.pumpwatch.connectors.core.InMemoryOutbox(),
            (t, k, v) -> {
                sent.add(new Sent(t, k, v));
                return CompletableFuture.completedFuture(null);
            }, PumpwatchKafkaProperties.defaults(), new SimpleMeterRegistry(), Clock.systemUTC());
    final HashSet<String> seen = new HashSet<>();
    final NewsSink sink = new NewsSink(publisher, (s, i) -> seen.contains(s + "|" + i), (s, i) -> seen.add(s + "|" + i), () -> false);

    /** State kept in a map here; the real store is Postgres. */
    static class MapStore implements FeedStateStore {
        final Map<String, FeedState> m = new HashMap<>();
        @Override public Optional<FeedState> get(String url) { return Optional.ofNullable(m.get(url)); }
        @Override public void save(String url, FeedState s) { m.put(url, s); }
    }

    record Req(String url, String ifNoneMatch, String ifModifiedSince) {}

    final List<Req> requests = new ArrayList<>();
    final Map<String, List<FeedHttp.Response>> script = new HashMap<>();
    final MapStore store = new MapStore();
    final FeedHttp http = (uri, inm, ims) -> {
        requests.add(new Req(uri.toString(), inm, ims));
        var q = script.get(uri.toString());
        if (q == null || q.isEmpty()) throw new java.io.IOException("no route");
        return q.size() == 1 ? q.get(0) : q.remove(0);
    };

    RssSource source(String... feeds) {
        publisher.start();
        return new RssSource(List.of(feeds), Duration.ofMinutes(1), http, store, new RateLimiter(6000, CLOCK), CLOCK);
    }

    static FeedHttp.Response ok(String xml, String etag, String lastModified) {
        return new FeedHttp.Response(200, xml.getBytes(StandardCharsets.UTF_8), etag, lastModified);
    }

    static String rss(String... items) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>Wire</title>"
                + String.join("", items) + "</channel></rss>";
    }

    static String item(String guid, String title, String desc, String pubDate) {
        return "<item><title>" + title + "</title><link>https://www.prnewswire.com/news/" + guid + "</link>"
                + (guid == null ? "" : "<guid isPermaLink=\"false\">" + guid + "</guid>")
                + "<description><![CDATA[" + desc + "]]></description><pubDate>" + pubDate + "</pubDate></item>";
    }

    List<ArticleRecord> articles() throws InterruptedException {
        Thread.sleep(300); // publisher thread drains asynchronously
        return sent.stream().map(x -> Json.fromJson(x.value(), ArticleRecord.class)).toList();
    }

    @Test
    void newItemIsNormalizedWithTickersFromTheItem() throws Exception {
        script.put(FEED, List.of(ok(rss(item("g-1", "ABCD Wins Contract", "Acme Corp. (NASDAQ: ABCD) and (NYSE: EFG) said...",
                "Fri, 02 Jan 2026 15:00:00 GMT")), "\"e1\"", "Fri, 02 Jan 2026 15:00:05 GMT")));
        source(FEED).run(sink);

        var a = articles().get(0);
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).topic()).isEqualTo(Topics.RAW_NEWS);
        assertThat(sent.get(0).key()).isEqualTo("g-1");
        assertThat(a.source()).isEqualTo("rss:www.prnewswire.com");
        assertThat(a.itemId()).isEqualTo("g-1");
        assertThat(a.headline()).isEqualTo("ABCD Wins Contract");
        assertThat(a.url()).isEqualTo("https://www.prnewswire.com/news/g-1");
        assertThat(a.tickers()).containsExactly("ABCD", "EFG");
        assertThat(a.fingerprint()).isEqualTo(Fingerprints.fingerprint("ABCD Wins Contract"));
        assertThat(a.eventTime()).isEqualTo(Instant.parse("2026-01-02T15:00:00Z"));
        assertThat(a.ingestTime()).isEqualTo(CLOCK.instant());
        assertThat(Validator.validate(a)).isEmpty();
        assertThat(store.get(FEED)).contains(new FeedState("\"e1\"", "Fri, 02 Jan 2026 15:00:05 GMT"));
    }

    @Test
    void itemWithoutTickersHasEmptyListAndFallsBackToLinkForId() throws Exception {
        script.put(FEED, List.of(ok(rss(item(null, "Quarterly Dividend", "Board declared a dividend.",
                "Fri, 02 Jan 2026 15:00:00 GMT")), null, null)));
        source(FEED).run(sink);
        var a = articles().get(0);
        assertThat(a.tickers()).isEmpty();
        assertThat(a.itemId()).isEqualTo("https://www.prnewswire.com/news/null");
    }

    @Test
    void unchangedFeedSendsValidatorsAndPublishesNothingOn304() throws Exception {
        script.put(FEED, new ArrayList<>(List.of(
                ok(rss(item("g-1", "One", "d", "Fri, 02 Jan 2026 15:00:00 GMT")), "\"e1\"", "Fri, 02 Jan 2026 15:00:05 GMT"),
                new FeedHttp.Response(304, new byte[0], null, null))));
        var src = source(FEED);
        src.run(sink);
        src.run(sink);

        assertThat(requests.get(0).ifNoneMatch()).isNull();
        assertThat(requests.get(1).ifNoneMatch()).isEqualTo("\"e1\"");
        assertThat(requests.get(1).ifModifiedSince()).isEqualTo("Fri, 02 Jan 2026 15:00:05 GMT");
        assertThat(articles()).hasSize(1);
        assertThat(store.get(FEED)).contains(new FeedState("\"e1\"", "Fri, 02 Jan 2026 15:00:05 GMT")); // kept on 304
    }

    @Test
    void changedFeedPublishesOnlyTheNewItem() throws Exception {
        var one = item("g-1", "One", "d", "Fri, 02 Jan 2026 15:00:00 GMT");
        var two = item("g-2", "Two", "d", "Fri, 02 Jan 2026 15:30:00 GMT");
        script.put(FEED, new ArrayList<>(List.of(ok(rss(one), "\"e1\"", null), ok(rss(two, one), "\"e2\"", null))));
        var src = source(FEED);
        src.run(sink);
        src.run(sink);
        assertThat(articles()).extracting(ArticleRecord::itemId).containsExactly("g-1", "g-2");
        assertThat(store.get(FEED).orElseThrow().etag()).isEqualTo("\"e2\"");
    }

    @Test
    void stateSurvivesANewSourceInstance() throws Exception {
        script.put(FEED, new ArrayList<>(List.of(ok(rss(item("g-1", "One", "d", "Fri, 02 Jan 2026 15:00:00 GMT")), "\"e1\"", null),
                new FeedHttp.Response(304, new byte[0], null, null))));
        source(FEED).run(sink);
        source(FEED).run(sink); // "restart": new instance, same store
        assertThat(requests.get(1).ifNoneMatch()).isEqualTo("\"e1\"");
    }

    @Test
    void oneBrokenFeedDoesNotStopTheNext() throws Exception {
        script.put(FEED, List.of(new FeedHttp.Response(500, new byte[0], null, null)));
        script.put(FEED2, List.of(ok(rss(item("g-9", "Nine", "d", "Fri, 02 Jan 2026 15:00:00 GMT")), null, null)));
        source(FEED, FEED2).run(sink);
        assertThat(articles()).extracting(ArticleRecord::itemId).containsExactly("g-9");
        assertThat(store.get(FEED)).isEmpty();
    }

    @Test
    void xxePayloadIsNotResolved(@TempDir Path dir) throws Exception {
        var secret = dir.resolve("secret.txt");
        Files.writeString(secret, "TOP-SECRET-MARKER");
        var xml = "<?xml version=\"1.0\"?><!DOCTYPE rss [<!ENTITY x SYSTEM \"" + secret.toUri() + "\">]>"
                + rss(item("g-1", "&x;", "&x;", "Fri, 02 Jan 2026 15:00:00 GMT"));
        script.put(FEED, List.of(ok(xml, null, null)));

        assertThatThrownBy(() -> RssParser.parse(xml.getBytes(StandardCharsets.UTF_8)))
                .satisfies(e -> assertThat(String.valueOf(e.getMessage())).doesNotContain("TOP-SECRET-MARKER"));
        source(FEED).run(sink);
        assertThat(articles()).isEmpty();
        assertThat(sent).noneMatch(s -> s.value().contains("TOP-SECRET-MARKER"));
        assertThat(store.get(FEED)).isEmpty();
    }

    @Test
    void itemWithoutUsableDateOrIdIsSkipped() throws Exception {
        script.put(FEED, List.of(ok(rss(item("g-1", "No date", "d", "yesterday-ish"),
                "<item><title>No id</title><pubDate>Fri, 02 Jan 2026 15:00:00 GMT</pubDate></item>"), null, null)));
        source(FEED).run(sink);
        assertThat(articles()).isEmpty();
    }

    @Test
    void extractsTickersOnlyFromExchangeMarkers() {
        assertThat(RssSource.tickers("Foo (Nasdaq: ABCD) and Bar (OTCQB: WXYZ), Reuters: NOPE, NYSE American: AA.B"))
                .containsExactly("ABCD", "WXYZ", "AA.B");
        assertThat(RssSource.tickers("nothing here, NASDAQ: lower")).isEmpty();
    }

    @Test
    void emptyFeedListFails() {
        assertThatThrownBy(() -> new RssSource(List.of(), Duration.ofMinutes(1), http, store, new RateLimiter(60, CLOCK), CLOCK))
                .hasMessageContaining("RSS_FEEDS");
        assertThat(URI.create(FEED).getHost()).isEqualTo("www.prnewswire.com");
    }
}
