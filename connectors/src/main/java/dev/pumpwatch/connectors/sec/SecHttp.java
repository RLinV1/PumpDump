package dev.pumpwatch.connectors.sec;

import dev.pumpwatch.connectors.core.RateLimiter;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Every SEC request: waits for the rate limiter, then sends the configured User-Agent. */
final class SecHttp {
    /** The actual network call; faked in tests. */
    interface Transport {
        String get(URI uri, String userAgent) throws IOException, InterruptedException;
    }

    interface Sleeper {
        void sleep(Duration d) throws InterruptedException;
    }

    private final Transport transport;
    private final RateLimiter limiter;
    private final String userAgent;
    private final Sleeper sleeper;

    SecHttp(Transport transport, RateLimiter limiter, String userAgent, Sleeper sleeper) {
        this.transport = transport;
        this.limiter = limiter;
        this.userAgent = userAgent;
        this.sleeper = sleeper;
    }

    static Transport jdk(HttpClient client) {
        return (uri, ua) -> {
            var req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).header("User-Agent", ua).GET().build();
            var r = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (r.statusCode() != 200) throw new IOException("SEC request failed with HTTP " + r.statusCode());
            return r.body();
        };
    }

    String get(URI uri) throws IOException, InterruptedException {
        while (!limiter.tryAcquire()) sleeper.sleep(Duration.ofMillis(50));
        return transport.get(uri, userAgent);
    }
}
