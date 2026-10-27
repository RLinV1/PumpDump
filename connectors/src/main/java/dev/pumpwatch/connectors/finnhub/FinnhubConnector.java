package dev.pumpwatch.connectors.finnhub;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.Connector;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.SeenItems;
import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Polls Finnhub company news for the watchlist plus general market news. Each cycle makes at most
 * {@code requestsPerMinute * pollInterval} calls: general news first, then the next tickers after the position stored
 * in Postgres, wrapping around, so a watchlist larger than one cycle allows is still covered fairly.
 */
public final class FinnhubConnector implements Connector {
    static final String NAME = "finnhub";
    static final String POSITION = "rotation-position";
    private static final int MAX_CONSECUTIVE_FAILURES = 3;
    private static final Logger log = LoggerFactory.getLogger(FinnhubConnector.class);

    private final FinnhubProperties props;
    private final List<String> watchlist;
    private final ConnectorPublisher publisher;
    private final FinnhubApi api;
    private final SeenItems seen;
    private final FinnhubState state;
    private final Clock clock;
    private volatile boolean stopped;
    private volatile Thread thread;

    FinnhubConnector(FinnhubProperties props, List<String> watchlist, ConnectorPublisher publisher, FinnhubApi api,
                     SeenItems seen, FinnhubState state, Clock clock) {
        this.props = props;
        this.watchlist = watchlist;
        this.publisher = publisher;
        this.api = api;
        this.seen = seen;
        this.state = state;
        this.clock = clock;
    }

    /** Startup guard: returns the upper-cased watchlist or throws so the app refuses to start. */
    static List<String> validate(FinnhubProperties p, List<String> watchlist) {
        if (p.token() == null || p.token().isBlank())
            throw new IllegalStateException("Finnhub is enabled but FINNHUB_TOKEN is not set");
        return watchlist.stream().map(String::trim).filter(s -> !s.isEmpty()).map(s -> s.toUpperCase(Locale.ROOT))
                .distinct().toList();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public void start() {
        if (thread != null) return;
        log.info("Finnhub connector starting: {} tickers, {} calls/min, every {}", watchlist.size(),
                props.requestsPerMinute(), props.pollInterval());
        thread = Thread.ofPlatform().daemon().name("finnhub-poll").start(this::runForever);
    }

    @Override
    public void stop() {
        stopped = true;
        var t = thread;
        if (t != null) t.interrupt();
    }

    private void runForever() {
        try {
            while (!stopped) {
                try {
                    runCycle();
                } catch (RuntimeException e) {
                    log.warn("Finnhub cycle failed: {}", e.toString());
                }
                Thread.sleep(props.pollInterval());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    int callsPerCycle() {
        return Math.max(2, (int) (props.requestsPerMinute() * props.pollInterval().toSeconds() / 60));
    }

    /** One polling pass. Package-private for tests. */
    void runCycle() throws InterruptedException {
        if (!publisher.isAcceptingRecords()) return;
        int failures = 0;
        try {
            if (!publish(api.generalNews())) return;
            publisher.markFetched();
        } catch (IOException e) {
            failures++;
            log.warn("Finnhub general news failed: {}", e.getMessage());
        }
        int n = watchlist.size();
        int start = n == 0 ? 0 : (int) (state.get(POSITION).map(Long::parseLong).orElse(0L) % n);
        var to = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        var from = to.minusDays(props.lookbackDays());
        for (int i = 0; i < Math.min(n, callsPerCycle() - 1) && failures < MAX_CONSECUTIVE_FAILURES; i++) {
            int idx = (start + i) % n;
            try {
                if (!publish(api.companyNews(watchlist.get(idx), from, to))) return; // buffer full: retry this ticker
                publisher.markFetched();
                failures = 0;
            } catch (IOException e) {
                failures++; // skip it so one bad ticker cannot stall the rotation
                log.warn("Finnhub company news for {} failed: {}", watchlist.get(idx), e.getMessage());
            }
            state.put(POSITION, Integer.toString((idx + 1) % n));
        }
    }

    /** Publishes unseen articles; false when the publisher buffer is full. Marks seen only after the offer succeeded. */
    private boolean publish(List<ArticleRecord> articles) {
        for (var a : articles) {
            if (seen.isSeen(NAME, a.itemId())) continue;
            if (!publisher.offer(Topics.RAW_NEWS, a.itemId(), a)) return false;
            seen.markNew(NAME, a.itemId());
        }
        return true;
    }
}
