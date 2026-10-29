package dev.pumpwatch.connectors.sec;

import dev.pumpwatch.common.FilingRecord;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.Connector;
import dev.pumpwatch.connectors.core.SeenItems;
import java.net.URI;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Polls the EDGAR current-filings feed for 8-K and 8-K/A, adds item codes from each filing index and the ticker
 * from the stored SEC mapping, and publishes to raw-filings keyed by accession number. A filing is marked seen only
 * after the publisher took it, so a refused record is retried on the next poll.
 *
 * <p>shortcut: a crash between the publisher accepting a record and the seen mark can publish it twice after restart;
 * the scorer should treat the accession number as an idempotency key.
 */
public final class SecConnector implements Connector {
    static final String NAME = "sec";
    private static final Logger log = LoggerFactory.getLogger(SecConnector.class);
    private static final Set<String> FORMS = Set.of("8-K", "8-K/A");

    /** The slice of ConnectorPublisher this connector needs. */
    interface Sink {
        boolean offer(String topic, String key, Object record);

        void markFetched();
    }

    private final SecProperties props;
    private final SecHttp http;
    private final TickerStore tickers;
    private final Sink sink;
    private final SeenItems seen;
    private final Clock clock;
    private ScheduledExecutorService executor;

    SecConnector(SecProperties props, SecHttp http, TickerStore tickers, Sink sink, SeenItems seen, Clock clock) {
        this.props = props;
        this.http = http;
        this.tickers = tickers;
        this.sink = sink;
        this.seen = seen;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    /** One thread runs both jobs, so polls and ticker refreshes never overlap. */
    @Override
    public synchronized void start() {
        if (executor != null) return;
        executor = Executors.newSingleThreadScheduledExecutor(r -> Thread.ofPlatform().daemon().name("sec-connector").unstarted(r));
        executor.scheduleWithFixedDelay(safely(this::refreshTickers), 0, props.tickerRefresh().toMillis(), TimeUnit.MILLISECONDS);
        executor.scheduleWithFixedDelay(safely(this::pollOnce), 1, props.pollInterval().toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public synchronized void stop() {
        if (executor != null) executor.shutdownNow();
        executor = null;
    }

    private static Runnable safely(Runnable r) {
        return () -> {
            try {
                r.run();
            } catch (RuntimeException e) {
                log.warn("[sec] job failed: {}", e.toString());
            }
        };
    }

    /** On failure the stored mapping stays in use. */
    void refreshTickers() {
        try {
            var entries = TickerStore.parse(http.get(URI.create(props.tickersUrl())));
            if (entries.isEmpty()) throw new IllegalStateException("empty ticker mapping");
            tickers.saveAll(entries);
            log.info("[sec] stored {} company tickers", entries.size());
        } catch (java.io.IOException | RuntimeException e) {
            log.warn("[sec] ticker refresh failed, keeping stored mapping: {}", e.toString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    void pollOnce() {
        try {
            var entries = AtomFeedParser.parse(http.get(URI.create(props.feedUrl())));
            sink.markFetched();
            // the feed is newest first; publish oldest first
            for (var e : entries.reversed()) {
                if (!FORMS.contains(e.form()) || seen.isSeen(NAME, e.accessionNumber())) continue;
                List<String> items;
                try {
                    items = FilingIndexParser.itemCodes(http.get(e.indexUrl()));
                } catch (java.io.IOException ex) {
                    log.warn("[sec] index fetch failed for {}, retrying next poll: {}", e.accessionNumber(), ex.toString());
                    continue;
                }
                var ticker = tickers.ticker(TickerStore.normalize(e.cik())).orElse(null);
                var rec = new FilingRecord(SchemaVersions.FILING, e.updated(), clock.instant(), e.accessionNumber(),
                        e.cik(), ticker, e.form(), items);
                if (!sink.offer(Topics.RAW_FILINGS, e.accessionNumber(), rec)) return; // buffer full: retry later
                seen.markNew(NAME, e.accessionNumber());
            }
        } catch (java.io.IOException | RuntimeException ex) {
            log.warn("[sec] poll failed: {}", ex.toString());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
