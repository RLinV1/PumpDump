package dev.pumpwatch.connectors.alpaca;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.Connector;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Streams Alpaca trades into the ticks topic. On reconnect it backfills from the last trade seen before the drop;
 * live and gap-filled trades share one dedupe check, so nothing is published twice.
 *
 * <p>shortcut: gap-filled trades may interleave with live ones for the same ticker (the spec allows "alongside");
 * hold live ticks until the backfill ends if strict per-ticker order across a reconnect is needed.
 */
public final class AlpacaConnector implements Connector {
    static final String NAME = "alpaca";
    private static final Logger log = LoggerFactory.getLogger(AlpacaConnector.class);
    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final long SUBSCRIBE_TIMEOUT_SECONDS = 30;

    private final AlpacaProperties props;
    private final List<String> symbols;
    private final ConnectorPublisher publisher;
    private final TradeStream stream;
    private final TradeHistory history;
    private final Predicate<String> markNew;
    private final Clock clock;
    private final String streamUrl;

    private volatile boolean stopped;
    private volatile Thread thread;
    private volatile TradeStream.Connection current;
    private Instant lastSeen; // guarded by this
    private Instant gapFrom;  // set when a session ends, cleared once a backfill from it succeeded; session thread only

    /** @param markNew true the first time a dedupe key is seen (SeenItems when a database exists, else in memory) */
    AlpacaConnector(AlpacaProperties props, List<String> watchlist, ConnectorPublisher publisher,
                    TradeStream stream, TradeHistory history, Predicate<String> markNew, Clock clock) {
        this.symbols = validate(props, watchlist);
        this.props = props;
        this.publisher = publisher;
        this.stream = stream;
        this.history = history;
        this.markNew = markNew;
        this.clock = clock;
        this.streamUrl = "wss://stream.data.alpaca.markets/v2/" + props.feed();
    }

    /** Free-tier guard rails: returns the normalized symbols or throws, so the app refuses to start. */
    static List<String> validate(AlpacaProperties p, List<String> watchlist) {
        var syms = List.copyOf(new LinkedHashSet<>(watchlist.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(Keys::tickerKey).toList()));
        if (syms.isEmpty()) throw new IllegalStateException("pumpwatch.watchlist is empty; Alpaca has nothing to subscribe to");
        if (syms.size() > p.symbolLimit())
            throw new IllegalStateException("watchlist has " + syms.size() + " symbols but the " + p.plan()
                    + " plan limit is " + p.symbolLimit() + " (pumpwatch.sources.alpaca.symbol-limit)");
        if (blank(p.keyId()) || blank(p.secretKey()))
            throw new IllegalStateException("Alpaca is enabled but ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set");
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
    public void start() {
        if (thread != null) return;
        log.info("Alpaca connector starting: plan={} feed={} symbols={} (limit {})", props.plan(), props.feed(),
                symbols.size(), props.symbolLimit());
        thread = Thread.ofPlatform().daemon().name("alpaca-stream").start(this::runForever);
    }

    @Override
    public void stop() {
        stopped = true;
        var c = current;
        if (c != null) c.close();
        var t = thread;
        if (t != null) t.interrupt();
    }

    static Duration backoff(int attempt) {
        return Duration.ofSeconds(Math.min(60, 1L << Math.min(attempt, 6)));
    }

    private void runForever() {
        int attempt = 0;
        while (!stopped) {
            try {
                if (session()) attempt = 0;
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                log.warn("Alpaca stream failed: {}", e.toString());
            }
            if (stopped) return;
            try {
                Thread.sleep(backoff(attempt++));
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    /** One connection: auth, subscribe, backfill any pending gap, then live until it closes. True if it got subscribed. */
    boolean session() throws Exception {
        var subscribed = new CompletableFuture<Void>();
        var closed = new CompletableFuture<Void>();
        try {
            current = stream.open(URI.create(streamUrl), new TradeStream.Listener() {
                @Override
                public void onText(TradeStream.Connection c, String text) {
                    try {
                        handleFrame(c, text, subscribed);
                    } catch (Exception e) {
                        log.warn("Alpaca frame skipped: {}", e.toString());
                    }
                }

                @Override
                public void onClose(String reason) {
                    log.info("Alpaca stream closed: {}", reason);
                    closed.complete(null);
                }
            });
            try {
                CompletableFuture.anyOf(subscribed, closed).get(SUBSCRIBE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.warn("Alpaca did not confirm the subscription within {}s", SUBSCRIBE_TIMEOUT_SECONDS);
                return false;
            }
            if (!subscribed.isDone()) return false;
            if (gapFrom != null) {
                gapFill(gapFrom);
                gapFrom = null;
            }
            while (!closed.isDone()) {
                try {
                    closed.get(10, TimeUnit.SECONDS);
                } catch (TimeoutException e) {
                    publisher.markFetched(); // quiet market, connection still up
                }
            }
            return true;
        } finally {
            var c = current;
            current = null;
            if (c != null) c.close();
            synchronized (this) {
                if (gapFrom == null) gapFrom = lastSeen;
            }
        }
    }

    private void handleFrame(TradeStream.Connection c, String text, CompletableFuture<Void> subscribed) throws Exception {
        JsonNode root = MAPPER.readTree(text);
        for (JsonNode m : root.isArray() ? root : List.of(root)) {
            switch (m.path("T").asText()) {
                case "t" -> {
                    publish(Trade.parse(m, m.get("S").asText()));
                    publisher.markFetched();
                }
                case "success" -> {
                    String msg = m.path("msg").asText();
                    if (msg.equals("connected")) {
                        var auth = MAPPER.createObjectNode().put("action", "auth").put("key", props.keyId())
                                .put("secret", props.secretKey());
                        c.send(auth.toString());
                    } else if (msg.equals("authenticated")) {
                        var sub = MAPPER.createObjectNode().put("action", "subscribe");
                        var arr = sub.putArray("trades");
                        symbols.forEach(arr::add);
                        c.send(sub.toString());
                    }
                }
                case "subscription" -> {
                    log.info("Alpaca subscribed to {} symbols", symbols.size());
                    subscribed.complete(null);
                }
                case "error" -> {
                    log.warn("Alpaca error {}: {}", m.path("code").asText(), m.path("msg").asText());
                    c.close();
                }
                default -> { }
            }
        }
    }

    private void gapFill(Instant from) throws Exception {
        Instant end = clock.instant();
        log.info("Alpaca gap fill from {} to {}", from, end);
        String token = null;
        do {
            var page = history.trades(symbols, from, end, token);
            for (var t : page.trades().stream().sorted(Comparator.comparing(Trade::time)).toList()) publish(t);
            token = page.nextPageToken();
            publisher.markFetched();
        } while (token != null && !stopped);
    }

    /** Waits for buffer space, drops already-seen trades, publishes the rest keyed by ticker. */
    private synchronized void publish(Trade t) {
        try {
            while (!publisher.isAcceptingRecords() && !stopped) Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        if (stopped || !markNew.test(t.dedupeKey())) return;
        var tick = new TickRecord(SchemaVersions.TICK, t.time(), clock.instant(), t.symbol(), t.price(), t.size(),
                t.exchange());
        publisher.offer(Topics.TICKS, Keys.tickerKey(t.symbol()), tick);
        if (lastSeen == null || t.time().isAfter(lastSeen)) lastSeen = t.time();
    }
}
