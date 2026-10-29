package dev.pumpwatch.connectors.alpacanews;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.connectors.alpaca.HttpTradeHistory;
import dev.pumpwatch.connectors.core.RateLimiter;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Pages through {@code GET /v1beta1/news}; every request waits on the rate limiter. Reuses the market-data HTTP seam. */
final class HttpNewsHistory implements NewsHistory {
    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final int MAX_ATTEMPTS = 3;

    private final HttpTradeHistory.Http http;
    private final String baseUrl;
    private final String keyId;
    private final String secretKey;
    private final RateLimiter limiter;
    private final Clock clock;

    HttpNewsHistory(HttpTradeHistory.Http http, String baseUrl, String keyId, String secretKey, RateLimiter limiter,
                    Clock clock) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.keyId = keyId;
        this.secretKey = secretKey;
        this.limiter = limiter;
        this.clock = clock;
    }

    @Override
    public Page news(List<String> symbols, Instant start, Instant end, String pageToken) throws IOException,
            InterruptedException {
        var url = new StringBuilder(baseUrl).append("/v1beta1/news?");
        if (!symbols.isEmpty()) url.append("symbols=").append(enc(String.join(",", symbols))).append('&');
        url.append("start=").append(enc(start.toString())).append("&end=").append(enc(end.toString()))
                .append("&limit=50&sort=asc");
        if (pageToken != null) url.append("&page_token=").append(enc(pageToken));
        var uri = URI.create(url.toString());
        for (int attempt = 1; ; attempt++) {
            limiter.acquire();
            var r = http.get(uri, keyId, secretKey);
            if (r.status() == 429 && attempt < MAX_ATTEMPTS) {
                limiter.pauseUntil(clock.instant().plusSeconds(retryAfter(r.retryAfterSeconds())));
                continue;
            }
            if (r.status() != 200) throw new IOException("Alpaca news request failed with HTTP " + r.status());
            return parse(r.body());
        }
    }

    static Page parse(String body) throws IOException {
        var root = MAPPER.readTree(body);
        var out = new ArrayList<JsonNode>();
        root.path("news").forEach(out::add);
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
