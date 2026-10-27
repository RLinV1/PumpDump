package dev.pumpwatch.connectors.alpaca;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.connectors.core.RateLimiter;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class HttpTradeHistoryTest {
    static final String PAGE1 = """
            {"trades":{"GME":[{"t":"2026-01-02T15:00:01.5Z","x":"V","p":21.5,"s":10,"c":["@"],"i":1,"z":"A"}],
             "AMC":[{"t":"2026-01-02T15:00:02Z","x":"K","p":3.25,"s":5,"i":9}]},"next_page_token":"tok2"}""";
    static final String PAGE2 = """
            {"trades":{"GME":[{"t":"2026-01-02T15:00:03Z","x":"V","p":21.6,"s":20,"i":2}]},"next_page_token":null}""";

    @Test
    void pagesThroughNextPageTokenWithHeadersAndRateLimit() throws Exception {
        var uris = new ArrayList<URI>();
        var keys = new ArrayList<String>();
        HttpTradeHistory.Http http = (uri, key, secret) -> {
            uris.add(uri);
            keys.add(key + "/" + secret);
            return new HttpTradeHistory.Response(200, uris.size() == 1 ? PAGE1 : PAGE2, null);
        };
        var h = new HttpTradeHistory(http, "https://data.alpaca.markets", "iex", "K", "S",
                new RateLimiter(6000, Clock.systemUTC()), Clock.systemUTC());
        var start = Instant.parse("2026-01-02T15:00:00Z");
        var end = Instant.parse("2026-01-02T15:05:00Z");

        var all = new ArrayList<Trade>();
        String token = null;
        do {
            var page = h.trades(List.of("GME", "AMC"), start, end, token);
            all.addAll(page.trades());
            token = page.nextPageToken();
        } while (token != null);

        assertThat(all).extracting(Trade::dedupeKey).containsExactlyInAnyOrder("GME:1", "AMC:9", "GME:2");
        assertThat(uris).hasSize(2);
        assertThat(uris.get(0).toString()).startsWith("https://data.alpaca.markets/v2/stocks/trades?symbols=GME%2CAMC")
                .contains("start=2026-01-02T15%3A00%3A00Z").contains("end=2026-01-02T15%3A05%3A00Z")
                .contains("feed=iex").doesNotContain("page_token");
        assertThat(uris.get(1).toString()).contains("page_token=tok2");
        assertThat(keys).containsOnly("K/S");
        assertThat(all.get(0).time()).isEqualTo(Instant.parse("2026-01-02T15:00:01.5Z"));
        assertThat(all.get(0).price()).isEqualByComparingTo("21.5");
    }
}
