package dev.pumpwatch.connectors.bluesky;

import com.fasterxml.jackson.databind.JsonNode;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.Connector;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.ConnectorPublishers;
import dev.pumpwatch.connectors.core.SeenItems;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/** Bluesky Jetstream posts filtered to the watchlist and published to raw-posts. Starts only when enabled. */
@Component
@ConditionalOnProperty(name = "pumpwatch.sources.bluesky.enabled", havingValue = "true")
@EnableConfigurationProperties(BlueskyProperties.class)
public class BlueskyConnector implements Connector {
    static final String SOURCE = "bluesky";
    static final long SAFETY_WINDOW_US = 5_000_000L; // resume this far before the last processed event
    private static final int MEMORY_SEEN_MAX = 100_000;
    private static final Logger log = LoggerFactory.getLogger(BlueskyConnector.class);

    private final BlueskyProperties props;
    private final PostFilter filter;
    private final ConnectorPublisher publisher;
    private final BiPredicate<String, String> markNew;
    private final JetstreamClient client;
    private final Clock clock;
    private final Duration initialBackoff;
    private final Duration maxBackoff;
    private final Counter unparseable;
    private final Counter kept;
    private volatile long lastTimeUs; // shortcut: in memory only, a process restart resumes live; persist it if gaps matter
    private volatile boolean running;
    private volatile boolean connectedOk;
    private volatile Thread thread;

    @Autowired
    public BlueskyConnector(BlueskyProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                            ConnectorPublishers publishers, ObjectProvider<SeenItems> seen, MeterRegistry meters,
                            Clock clock) {
        this(props, watchlist, publishers.create(SOURCE), dedupe(seen.getIfAvailable()), new JdkJetstreamClient(),
                meters, clock, Duration.ofSeconds(1), Duration.ofMinutes(1));
    }

    BlueskyConnector(BlueskyProperties props, List<String> watchlist, ConnectorPublisher publisher,
                     BiPredicate<String, String> markNew, JetstreamClient client, MeterRegistry meters, Clock clock,
                     Duration initialBackoff, Duration maxBackoff) {
        this.props = props;
        this.filter = new PostFilter(watchlist, props.financeTerms());
        this.publisher = publisher;
        this.markNew = markNew;
        this.client = client;
        this.clock = clock;
        this.initialBackoff = initialBackoff;
        this.maxBackoff = maxBackoff;
        this.unparseable = Counter.builder("pumpwatch.bluesky.unparseable").register(meters);
        this.kept = Counter.builder("pumpwatch.bluesky.kept").register(meters);
    }

    /** The database table when there is one; else a bounded in-memory set (shortcut: forgotten on restart). */
    static BiPredicate<String, String> dedupe(SeenItems db) {
        if (db != null) return db::markNew;
        var seen = Collections.newSetFromMap(new LinkedHashMap<String, Boolean>() {
            @Override protected boolean removeEldestEntry(Map.Entry<String, Boolean> e) {
                return size() > MEMORY_SEEN_MAX;
            }
        });
        return (source, id) -> {
            synchronized (seen) { return seen.add(source + ":" + id); }
        };
    }

    @Override public String name() { return SOURCE; }

    @Override
    public synchronized void start() {
        if (running) return;
        running = true;
        thread = Thread.ofPlatform().daemon().name("bluesky-jetstream").start(this::loop);
    }

    @Override
    public synchronized void stop() {
        running = false;
        var t = thread;
        if (t != null) t.interrupt();
    }

    /** Package-private so tests can drive it without a thread. */
    void loop() {
        var backoff = initialBackoff;
        while (running) {
            connectedOk = false;
            try {
                client.connect(uri(), this::onMessage);
                log.info("Jetstream closed, reconnecting");
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                log.warn("Jetstream connection failed: {}", e.toString());
            }
            if (!running) return;
            if (connectedOk) backoff = initialBackoff;
            try {
                Thread.sleep(backoff.toMillis());
            } catch (InterruptedException e) {
                return;
            }
            backoff = backoff.multipliedBy(2).compareTo(maxBackoff) > 0 ? maxBackoff : backoff.multipliedBy(2);
        }
    }

    URI uri() {
        var sb = new StringBuilder(props.url()).append(props.url().contains("?") ? '&' : '?')
                .append("wantedCollections=app.bsky.feed.post");
        if (lastTimeUs > 0) sb.append("&cursor=").append(Math.max(0, lastTimeUs - SAFETY_WINDOW_US));
        return URI.create(sb.toString());
    }

    void onMessage(String json) {
        connectedOk = true;
        publisher.markFetched();
        JsonNode e;
        try {
            e = Json.newMapper().readTree(json);
        } catch (Exception ex) {
            unparseable.increment();
            log.debug("unparseable Jetstream message ({} chars)", json.length());
            return;
        }
        if (e == null || !e.isObject()) {
            unparseable.increment();
            return;
        }
        var commit = e.path("commit");
        if ("commit".equals(e.path("kind").asText()) && "create".equals(commit.path("operation").asText())
                && "app.bsky.feed.post".equals(commit.path("collection").asText())) {
            handlePost(e, commit);
        }
        lastTimeUs = Math.max(lastTimeUs, e.path("time_us").asLong(0));
    }

    private void handlePost(JsonNode e, JsonNode commit) {
        var record = commit.path("record");
        var text = record.path("text").asText("");
        if (!filter.keep(text)) return;
        var did = e.path("did").asText(null);
        var rkey = commit.path("rkey").asText(null);
        var postId = did == null || rkey == null ? null : did + "/" + rkey;
        if (postId != null && !markNew.test(SOURCE, postId)) return;
        var post = new PostRecord(SchemaVersions.POST, parseTime(record.path("createdAt").asText(null)),
                clock.instant(), SOURCE, postId, did, null, text);
        var key = Keys.postKey(SOURCE, postId);
        try {
            while (running && !publisher.offer(Topics.RAW_POSTS, key, post)) Thread.sleep(50); // buffer full: wait
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", ex);
        }
        kept.increment();
    }

    private static Instant parseTime(String s) {
        try {
            return s == null ? null : OffsetDateTime.parse(s).toInstant();
        } catch (RuntimeException ex) {
            return null; // null eventTime fails validation, so the record dead-letters
        }
    }
}
