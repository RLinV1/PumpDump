package dev.pumpwatch.connectors.sec;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.FilingRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.RateLimiter;
import dev.pumpwatch.connectors.core.SeenItems;
import java.io.IOException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SecConnectorTest {
    static final class TestClock extends Clock {
        Instant now = Instant.parse("2026-01-05T22:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    record Call(URI uri, String userAgent, Instant at) {}

    final TestClock clock = new TestClock();
    final List<Call> calls = new ArrayList<>();
    final Map<String, String> pages = new HashMap<>();
    final Map<String, String> tickers = new HashMap<>();
    final List<FilingRecord> published = new ArrayList<>();
    final List<String> keys = new ArrayList<>();
    final Set<String> seen = new HashSet<>();
    String feed = "";
    boolean accepting = true;
    SecConnector connector;

    @BeforeEach
    void setUp() {
        SecHttp.Transport transport = (uri, ua) -> {
            calls.add(new Call(uri, ua, clock.instant()));
            if (uri.toString().contains("browse-edgar")) return feed;
            var p = pages.get(uri.toString());
            if (p == null) throw new IOException("404");
            return p;
        };
        var http = new SecHttp(transport, new RateLimiter(300, clock), "Pumpwatch test@example.com",
                d -> clock.now = clock.now.plus(d));
        var store = new TickerStore() {
            public Optional<String> ticker(String cik) { return Optional.ofNullable(tickers.get(cik)); }
            public void saveAll(List<Entry> entries) { entries.forEach(e -> tickers.put(e.cik(), e.ticker())); }
        };
        var seenItems = new SeenItems(null) {
            @Override public boolean isSeen(String source, String id) { return seen.contains(id); }
            @Override public boolean markNew(String source, String id) { return seen.add(id); }
        };
        var sink = new SecConnector.Sink() {
            public boolean offer(String topic, String key, Object r) {
                if (!accepting) return false;
                assertThat(topic).isEqualTo(Topics.RAW_FILINGS);
                keys.add(key);
                published.add((FilingRecord) r);
                return true;
            }
            public void markFetched() {}
        };
        connector = new SecConnector(new SecProperties(null, null, null, null), http, store, sink, seenItems, clock);
    }

    static String entry(String form, String name, String cik, String acc, String updated) {
        return "<entry><title>" + form + " - " + name + " (" + cik + ") (Filer)</title>"
                + "<link href=\"https://www.sec.gov/Archives/" + acc + "-index.htm\"/><updated>" + updated + "</updated>"
                + "<id>urn:tag:sec.gov,2008:accession-number=" + acc + "</id></entry>";
    }

    static String feedOf(String... entries) {
        return "<feed xmlns=\"http://www.w3.org/2005/Atom\">" + String.join("", entries) + "</feed>";
    }

    static String index(String... items) {
        var sb = new StringBuilder("<div class=\"infoHead\">Items</div>\n<div class=\"info\">");
        for (var i : items) sb.append("Item ").append(i).append(": x<br>");
        return sb.append("</div>").toString();
    }

    void page(String acc, String... items) {
        pages.put("https://www.sec.gov/Archives/" + acc + "-index.htm", index(items));
    }

    @Test
    void publishesOnlyEightKForms() {
        feed = feedOf(entry("8-K", "A", "0000000001", "a1", "2026-01-05T16:30:12-05:00"),
                entry("10-Q", "B", "0000000002", "a2", "2026-01-05T16:30:12-05:00"),
                entry("8-K/A", "C", "0000000003", "a3", "2026-01-05T16:30:12-05:00"));
        page("a1", "1.01");
        page("a3", "8.01");
        connector.pollOnce();
        assertThat(published).extracting(FilingRecord::form).containsExactlyInAnyOrder("8-K", "8-K/A");
        assertThat(calls).noneMatch(c -> c.uri().toString().contains("a2"));
    }

    @Test
    void knownFilerGetsTickerAndUnmappedGetsNull() {
        tickers.put("320193", "AAPL");
        feed = feedOf(entry("8-K", "APPLE", "0000320193", "a1", "2026-01-05T16:30:12-05:00"),
                entry("8-K", "TINY", "0009999999", "a2", "2026-01-05T16:31:12-05:00"));
        page("a1", "2.02", "9.01");
        page("a2", "1.01");
        connector.pollOnce();
        var apple = published.stream().filter(r -> r.accessionNumber().equals("a1")).findFirst().orElseThrow();
        var tiny = published.stream().filter(r -> r.accessionNumber().equals("a2")).findFirst().orElseThrow();
        assertThat(apple.ticker()).isEqualTo("AAPL");
        assertThat(apple.itemCodes()).containsExactly("2.02", "9.01");
        assertThat(apple.cik()).isEqualTo("0000320193");
        assertThat(apple.eventTime()).isEqualTo(Instant.parse("2026-01-05T21:30:12Z"));
        assertThat(apple.ingestTime()).isEqualTo(clock.instant());
        assertThat(tiny.ticker()).isNull();
        assertThat(keys).containsExactlyInAnyOrder("a1", "a2");
    }

    @Test
    void sameAccessionNumberPublishedOnce() {
        feed = feedOf(entry("8-K", "A", "0000000001", "a1", "2026-01-05T16:30:12-05:00"),
                entry("8-K", "A", "0000000001", "a1", "2026-01-05T16:30:12-05:00"));
        page("a1", "1.01");
        connector.pollOnce();
        connector.pollOnce();
        assertThat(published).hasSize(1);
    }

    @Test
    void notMarkedSeenWhenPublisherRefuses() {
        feed = feedOf(entry("8-K", "A", "0000000001", "a1", "2026-01-05T16:30:12-05:00"));
        page("a1", "1.01");
        accepting = false;
        connector.pollOnce();
        assertThat(seen).isEmpty();
        accepting = true;
        connector.pollOnce();
        assertThat(published).hasSize(1);
        assertThat(seen).containsExactly("a1");
    }

    @Test
    void burstOf50FilingsStaysUnderRateLimitAndEveryRequestHasUserAgent() {
        var es = new String[50];
        for (int i = 0; i < 50; i++) {
            es[i] = entry("8-K", "C" + i, "00000000" + (10 + i), "acc" + i, "2026-01-05T16:30:12-05:00");
            page("acc" + i, "8.01");
        }
        feed = feedOf(es);
        connector.pollOnce();
        assertThat(published).hasSize(50);
        assertThat(calls).hasSize(51).allMatch(c -> "Pumpwatch test@example.com".equals(c.userAgent()));
        for (var c : calls) {
            long inWindow = calls.stream().filter(o -> !o.at().isAfter(c.at())
                    && o.at().isAfter(c.at().minus(Duration.ofSeconds(1)))).count();
            assertThat(inWindow).as("requests in the second ending %s", c.at()).isLessThanOrEqualTo(10);
        }
        // 300/min with a 5-token burst: 51 requests cannot finish faster than about 9 seconds
        assertThat(Duration.between(calls.getFirst().at(), calls.getLast().at())).isGreaterThan(Duration.ofSeconds(8));
    }

    @Test
    void refreshTickersStoresMapping() {
        pages.put(SecProperties.DEFAULT_TICKERS_URL, "{\"0\":{\"cik_str\":320193,\"ticker\":\"AAPL\",\"title\":\"Apple\"}}");
        connector.refreshTickers();
        assertThat(tickers).containsEntry("320193", "AAPL");
        assertThat(calls.getFirst().userAgent()).isEqualTo("Pumpwatch test@example.com");
    }
}
