package dev.pumpwatch.connectors.finnhub;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.SchemaVersions;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Finnhub REST calls. The token travels only in the {@code X-Finnhub-Token} header, never in the URL, and no log line
 * here prints a URI, header or response body.
 */
final class FinnhubApi {
    record Response(int status, String body, String retryAfterSeconds) {}

    /** Seam over the HTTP call so tests can fake it. */
    interface Http {
        Response get(URI uri, String token) throws IOException, InterruptedException;
    }

    /** Blocks until the next call may go out (production: {@link RateLimiter#acquire()}). */
    @FunctionalInterface
    interface Pace {
        void await();
    }

    static final String BASE_URL = "https://finnhub.io";
    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final int MAX_ATTEMPTS = 3;
    private static final long DEFAULT_RETRY_SECONDS = 60;

    private final Http http;
    private final String baseUrl;
    private final String token;
    private final Pace pace;
    private final RateLimiter limiter;
    private final Clock clock;

    FinnhubApi(Http http, String baseUrl, String token, RateLimiter limiter, Pace pace, Clock clock) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.token = token;
        this.limiter = limiter;
        this.pace = pace;
        this.clock = clock;
    }

    static Http jdk(HttpClient client) {
        return (uri, token) -> {
            var req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).header("X-Finnhub-Token", token)
                    .GET().build();
            var r = client.send(req, HttpResponse.BodyHandlers.ofString());
            return new Response(r.statusCode(), r.body(), r.headers().firstValue("Retry-After").orElse(null));
        };
    }

    List<ArticleRecord> companyNews(String symbol, LocalDate from, LocalDate to) throws IOException,
            InterruptedException {
        return fetch("/api/v1/company-news?symbol=" + enc(symbol) + "&from=" + from + "&to=" + to);
    }

    List<ArticleRecord> generalNews() throws IOException, InterruptedException {
        return fetch("/api/v1/news?category=general");
    }

    private List<ArticleRecord> fetch(String path) throws IOException, InterruptedException {
        var uri = URI.create(baseUrl + path);
        for (int attempt = 1; ; attempt++) {
            pace.await();
            var r = http.get(uri, token);
            if (r.status() == 429) {
                limiter.pauseUntil(clock.instant().plusSeconds(retryAfter(r.retryAfterSeconds())));
                if (attempt < MAX_ATTEMPTS) continue;
            }
            if (r.status() != 200) throw new IOException("Finnhub request failed with HTTP " + r.status());
            return parse(r.body(), clock.instant());
        }
    }

    static List<ArticleRecord> parse(String body, Instant ingestTime) throws IOException {
        JsonNode root = MAPPER.readTree(body);
        if (root == null || !root.isArray()) throw new IOException("Finnhub response is not a JSON array");
        var out = new ArrayList<ArticleRecord>();
        for (var n : root) {
            if (!n.hasNonNull("id") || !n.hasNonNull("datetime")) continue; // cannot dedupe or time it: skip
            String headline = n.path("headline").asText("");
            var tickers = Arrays.stream(n.path("related").asText("").split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).map(Keys::tickerKey).distinct().toList();
            out.add(new ArticleRecord(SchemaVersions.ARTICLE, Instant.ofEpochSecond(n.get("datetime").asLong()),
                    ingestTime, FinnhubConnector.NAME, n.get("id").asText(), headline, n.path("url").asText(null),
                    tickers, Fingerprints.fingerprint(headline)));
        }
        return out;
    }

    private static long retryAfter(String header) {
        try {
            return header == null ? DEFAULT_RETRY_SECONDS : Math.max(1, Long.parseLong(header.trim()));
        } catch (NumberFormatException e) {
            return DEFAULT_RETRY_SECONDS;
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
