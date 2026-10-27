package dev.pumpwatch.connectors.rss;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Fingerprints;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.connectors.core.NewsSink;
import dev.pumpwatch.connectors.core.NewsSource;
import dev.pumpwatch.connectors.core.RateLimiter;
import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Polls press-release feeds with conditional requests. ETag / Last-Modified live in Postgres (not memory), so a
 * restart does not refetch unchanged feeds; the sink's seen-item check removes any overlap. One feed failing is
 * logged and the next feed still runs; the source's health only drops when no feed has succeeded for a while.
 */
public final class RssSource implements NewsSource {
    static final String NAME = "rss";
    private static final Logger log = LoggerFactory.getLogger(RssSource.class);
    // "(NASDAQ: ABCD)", "NYSE American: AA.B"; only the exchange name is case-insensitive
    private static final Pattern TICKER = Pattern.compile(
            "(?i:\\b(?:NASDAQ|NYSE(?:\\s+(?:American|MKT|Arca))?|AMEX|OTC(?:QB|QX|\\s+Markets|\\s+Pink)?|TSXV?|CSE))"
                    + "\\s*:\\s*([A-Z]{1,5}(?:\\.[A-Z])?)(?![A-Za-z])");

    private final List<String> feeds;
    private final Duration interval;
    private final FeedHttp http;
    private final FeedStateStore store;
    private final RateLimiter limiter;
    private final Clock clock;

    RssSource(List<String> feeds, Duration interval, FeedHttp http, FeedStateStore store, RateLimiter limiter, Clock clock) {
        if (feeds.isEmpty()) throw new IllegalStateException("RSS is enabled but RSS_FEEDS is empty");
        this.feeds = List.copyOf(feeds);
        this.interval = interval;
        this.http = http;
        this.store = store;
        this.limiter = limiter;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean streaming() {
        return false;
    }

    @Override
    public Duration interval() {
        return interval;
    }

    @Override
    public void run(NewsSink sink) throws InterruptedException {
        for (var feed : feeds) {
            try {
                poll(feed, sink);
            } catch (InterruptedException e) {
                throw e;
            } catch (Exception e) {
                log.warn("RSS feed {} failed: {}", feed, e.toString());
            }
        }
    }

    private void poll(String feed, NewsSink sink) throws Exception {
        limiter.acquire();
        var prior = store.get(feed).orElse(new FeedState(null, null));
        var r = http.get(URI.create(feed), prior.etag(), prior.lastModified());
        if (r.status() == 304) {
            sink.fetched();
            return;
        }
        if (r.status() != 200) throw new IOException("HTTP " + r.status());
        String source = "rss:" + URI.create(feed).getHost().toLowerCase(Locale.ROOT);
        for (var item : RssParser.parse(r.body())) {
            var a = normalize(source, item);
            if (a == null) log.warn("RSS {} item skipped (no id or no usable pubDate): {}", source, item.title());
            else sink.publish(a);
        }
        store.save(feed, new FeedState(r.etag(), r.lastModified())); // after publishing: a crash refetches, never skips
        sink.fetched();
    }

    private ArticleRecord normalize(String source, RssParser.Item i) {
        String id = i.guid() != null ? i.guid() : i.link();
        Instant time = parseDate(i.pubDate());
        if (id == null || time == null) return null;
        String headline = i.title() == null ? "" : i.title();
        var tickers = tickers(headline + " " + (i.description() == null ? "" : i.description()));
        return new ArticleRecord(SchemaVersions.ARTICLE, time, clock.instant(), source, id, headline, i.link(), tickers,
                Fingerprints.fingerprint(headline));
    }

    private static Instant parseDate(String s) {
        if (s == null) return null;
        try {
            return ZonedDateTime.parse(s, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Tickers named next to an exchange in the item text; nothing is guessed from other words. */
    static List<String> tickers(String text) {
        var out = new LinkedHashSet<String>();
        var m = TICKER.matcher(text);
        while (m.find()) out.add(m.group(1));
        return List.copyOf(out);
    }
}
