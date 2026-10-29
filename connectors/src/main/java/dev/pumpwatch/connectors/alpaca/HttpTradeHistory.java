package dev.pumpwatch.connectors.alpaca;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.connectors.core.RateLimiter;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Pages through {@code GET /v2/stocks/trades}; every request waits on the rate limiter. */
public final class HttpTradeHistory implements TradeHistory {
    public record Response(int status, String body, String retryAfterSeconds) {}

    /** Seam over the HTTP call so tests can fake it. Headers carry the credentials: implementations must not log them. */
    public interface Http {
        Response get(URI uri, String keyId, String secretKey) throws IOException, InterruptedException;
    }

    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final int MAX_ATTEMPTS = 3;

    private final Http http;
    private final String baseUrl;
    private final String feed;
    private final String keyId;
    private final String secretKey;
    private final RateLimiter limiter;
    private final Clock clock;

    HttpTradeHistory(Http http, String baseUrl, String feed, String keyId, String secretKey, RateLimiter limiter,
                     Clock clock) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.feed = feed;
        this.keyId = keyId;
        this.secretKey = secretKey;
        this.limiter = limiter;
        this.clock = clock;
    }

    public static Http jdk(HttpClient client) {
        return (uri, key, secret) -> {
            var req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
                    .header("APCA-API-KEY-ID", key).header("APCA-API-SECRET-KEY", secret).GET().build();
            var r = client.send(req, HttpResponse.BodyHandlers.ofString());
            return new Response(r.statusCode(), r.body(), r.headers().firstValue("Retry-After").orElse(null));
        };
    }

    @Override
    public Page trades(List<String> symbols, Instant start, Instant end, String pageToken) throws IOException,
            InterruptedException {
        var url = new StringBuilder(baseUrl).append("/v2/stocks/trades?symbols=")
                .append(enc(String.join(",", symbols))).append("&start=").append(enc(start.toString()))
                .append("&end=").append(enc(end.toString())).append("&feed=").append(enc(feed))
                .append("&limit=10000&sort=asc");
        if (pageToken != null) url.append("&page_token=").append(enc(pageToken));
        var uri = URI.create(url.toString());
        for (int attempt = 1; ; attempt++) {
            limiter.acquire();
            var r = http.get(uri, keyId, secretKey);
            if (r.status() == 429 && attempt < MAX_ATTEMPTS) {
                limiter.pauseUntil(clock.instant().plusSeconds(retryAfter(r.retryAfterSeconds())));
                continue;
            }
            if (r.status() != 200) throw new IOException("Alpaca trades request failed with HTTP " + r.status());
            return parse(r.body());
        }
    }

    static Page parse(String body) throws IOException {
        var root = MAPPER.readTree(body);
        var out = new ArrayList<Trade>();
        root.path("trades").fields().forEachRemaining(e -> {
            for (var n : e.getValue()) out.add(Trade.parse(n, e.getKey()));
        });
        var next = root.path("next_page_token");
        return new Page(out, next.isNull() || next.isMissingNode() ? null : next.asText());
    }

    private static long retryAfter(String header) {
        try {
            return header == null ? 60 : Math.max(1, Long.parseLong(header.trim()));
        } catch (NumberFormatException e) {
            return 60;
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
