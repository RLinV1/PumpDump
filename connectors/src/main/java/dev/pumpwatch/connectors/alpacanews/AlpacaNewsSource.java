package dev.pumpwatch.connectors.alpacanews;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.connectors.alpaca.TradeStream;
import dev.pumpwatch.connectors.core.NewsSink;
import dev.pumpwatch.connectors.core.NewsSource;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Alpaca News over WebSocket. Each {@link #run} is one connection: after subscribing it backfills over REST from the
 * newest article seen (or {@code backfill-minutes} ago on the first run and after a restart), so a drop or restart
 * leaves no gap; the sink's seen-item check removes the overlap. The scheduler restarts it with capped backoff.
 */
public final class AlpacaNewsSource implements NewsSource {
    static final String NAME = "alpaca-news";
    static final String SOURCE = "alpaca";
    static final String STREAM_URL = "wss://stream.data.alpaca.markets/v1beta1/news";
    private static final Logger log = LoggerFactory.getLogger(AlpacaNewsSource.class);
    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final long SUBSCRIBE_TIMEOUT_SECONDS = 30;

    private final AlpacaNewsProperties props;
    private final List<String> symbols;
    private final TradeStream stream;
    private final NewsHistory history;
    private final Clock clock;

    private volatile boolean stopped;
    private volatile TradeStream.Connection current;
    private volatile Instant lastSeen; // newest created_at seen; in memory only, a restart falls back to backfill-minutes

    AlpacaNewsSource(AlpacaNewsProperties props, List<String> watchlist, TradeStream stream, NewsHistory history,
                     Clock clock) {
        this.symbols = validate(props, watchlist);
        this.props = props;
        this.stream = stream;
        this.history = history;
        this.clock = clock;
    }

    /** Returns the normalized symbols (empty when subscribing to everything) or throws so the app refuses to start. */
    static List<String> validate(AlpacaNewsProperties p, List<String> watchlist) {
        if (blank(p.keyId()) || blank(p.secretKey()))
            throw new IllegalStateException("Alpaca News is enabled but ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set");
        if (p.subscribeAll()) return List.of();
        var syms = List.copyOf(new LinkedHashSet<>(watchlist.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(Keys::tickerKey).toList()));
        if (syms.isEmpty())
            throw new IllegalStateException("pumpwatch.watchlist is empty; Alpaca News has nothing to subscribe to");
        return syms;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean streaming() {
        return true;
    }

    @Override
    public Duration interval() {
        return Duration.ZERO;
    }

    @Override
    public void stop() {
        stopped = true;
        var c = current;
        if (c != null) c.close();
    }

    @Override
    public void run(NewsSink sink) throws Exception {
        var subscribed = new CompletableFuture<Void>();
        var closed = new CompletableFuture<Void>();
        // taken before connecting: live articles that arrive during the handshake must not shorten the backfill
        Instant from = lastSeen != null ? lastSeen : clock.instant().minus(Duration.ofMinutes(props.backfillMinutes()));
        try {
            current = stream.open(URI.create(STREAM_URL), new TradeStream.Listener() {
                @Override
                public void onText(TradeStream.Connection c, String text) {
                    try {
                        handleFrame(c, text, subscribed, sink);
                    } catch (Exception e) {
                        log.warn("Alpaca News frame skipped: {}", e.toString());
                    }
                }

                @Override
                public void onClose(String reason) {
                    log.info("Alpaca News stream closed: {}", reason);
                    closed.complete(null);
                }
            });
            try {
                CompletableFuture.anyOf(subscribed, closed).get(SUBSCRIBE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                throw new IllegalStateException("Alpaca News did not confirm the subscription in "
                        + SUBSCRIBE_TIMEOUT_SECONDS + "s");
            }
            if (!subscribed.isDone()) throw new IllegalStateException("Alpaca News closed before subscribing (auth failed?)");
            gapFill(sink, from);
            while (!closed.isDone() && !stopped) {
                try {
                    closed.get(10, TimeUnit.SECONDS);
                } catch (TimeoutException e) {
                    sink.fetched(); // quiet news flow, connection still up
                }
            }
        } finally {
            var c = current;
            current = null;
            if (c != null) c.close();
        }
    }

    private void handleFrame(TradeStream.Connection c, String text, CompletableFuture<Void> subscribed, NewsSink sink)
            throws Exception {
        JsonNode root = MAPPER.readTree(text);
        for (JsonNode m : root.isArray() ? root : List.of(root)) {
            switch (m.path("T").asText()) {
                case "n" -> {
                    publish(sink, m);
                    sink.fetched();
                }
                case "success" -> {
                    String msg = m.path("msg").asText();
                    if (msg.equals("connected")) {
                        c.send(MAPPER.createObjectNode().put("action", "auth").put("key", props.keyId())
                                .put("secret", props.secretKey()).toString());
                    } else if (msg.equals("authenticated")) {
                        var sub = MAPPER.createObjectNode().put("action", "subscribe");
                        var arr = sub.putArray("news");
                        if (symbols.isEmpty()) arr.add("*");
                        else symbols.forEach(arr::add);
                        c.send(sub.toString());
                    }
                }
                case "subscription" -> {
                    log.info("Alpaca News subscribed ({})", symbols.isEmpty() ? "all" : symbols.size() + " symbols");
                    subscribed.complete(null);
                }
                case "error" -> {
                    log.warn("Alpaca News error {}: {}", m.path("code").asText(), m.path("msg").asText());
                    c.close();
                }
                default -> { }
            }
        }
    }

    private void gapFill(NewsSink sink, Instant from) throws Exception {
        Instant end = clock.instant();
        log.info("Alpaca News backfill from {} to {}", from, end);
        String token = null;
        do {
            var page = history.news(symbols, from, end, token);
            page.articles().forEach(a -> publish(sink, a));
            token = page.nextPageToken();
            sink.fetched();
        } while (token != null && !stopped);
    }

    private void publish(NewsSink sink, JsonNode n) {
        var a = normalize(n, clock.instant());
        if (lastSeen == null || a.eventTime().isAfter(lastSeen)) lastSeen = a.eventTime();
        sink.publish(a);
    }

    /** Works for both the stream frame and the REST item. Invalid symbols (e.g. crypto pairs) are dropped. */
    static ArticleRecord normalize(JsonNode n, Instant ingest) {
        var headline = n.path("headline").asText("");
        var tickers = new LinkedHashSet<String>();
        n.path("symbols").forEach(s -> {
            var t = Keys.tickerKey(s.asText());
            if (t.matches("[A-Z.]{1,10}")) tickers.add(t);
        });
        return new ArticleRecord(SchemaVersions.ARTICLE, Instant.parse(n.path("created_at").asText()), ingest, SOURCE,
                n.path("id").asText(), headline, n.path("url").asText(null), List.copyOf(tickers),
                Fingerprints.fingerprint(headline));
    }
}
