package dev.pumpwatch.connectors.bluesky;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.Connector;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.ConnectorPositions;
import dev.pumpwatch.connectors.core.ConnectorPublishers;
import dev.pumpwatch.connectors.core.SeenItems;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final ObjectMapper MAPPER = Json.newMapper();
    private static final Logger log = LoggerFactory.getLogger(BlueskyConnector.class);

    private final BlueskyProperties props;
    private final PostFilter filter;
    private final ConnectorPublisher publisher;
    private final SeenItems seen;
    private final ConnectorPositions positions;
    private final JetstreamClient client;
    private final Clock clock;
    private final Duration initialBackoff;
    private final Duration maxBackoff;
    private final Counter unparseable;
    private final Counter kept;
    private volatile long lastTimeUs;
    private volatile long lastSavedMs;
    private volatile boolean running;
    private volatile boolean connectedOk;
    private volatile Thread thread;

    @Autowired
    public BlueskyConnector(BlueskyProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                            ConnectorPublishers publishers, SeenItems seen, ConnectorPositions positions,
                            MeterRegistry meters, Clock clock) {
        this(props, watchlist, publishers.create(SOURCE), seen, positions, new JdkJetstreamClient(), meters, clock, Duration.ofSeconds(1), Duration.ofMinutes(1));
    }

    BlueskyConnector(BlueskyProperties props, List<String> watchlist, ConnectorPublisher publisher,
                     SeenItems seen, ConnectorPositions positions, JetstreamClient client, MeterRegistry meters, Clock clock,
                     Duration initialBackoff, Duration maxBackoff) {
        this.props = props;
        this.filter = new PostFilter(watchlist, props.financeTerms());
        this.publisher = publisher;
        this.seen = seen;
        this.positions = positions;
        this.client = client;
        this.clock = clock;
        this.initialBackoff = initialBackoff;
        this.maxBackoff = maxBackoff;
        this.unparseable = Counter.builder("pumpwatch.bluesky.unparseable").register(meters);
        this.kept = Counter.builder("pumpwatch.bluesky.kept").register(meters);
    }

    @Override public String name() { return SOURCE; }

    @Override
    @PostConstruct
    public synchronized void start() {
        if (running) return;
        running = true;
        var saved = positions.load(SOURCE);
        if (saved != null) lastTimeUs = Long.parseLong(saved);
        thread = Thread.ofPlatform().daemon().name("bluesky-jetstream").start(this::loop);
    }

    @Override
    @PreDestroy
    public synchronized void stop() {
        running = false;
        var t = thread;
        if (t != null) t.interrupt();
        savePosition(true);
    }

    /** At most about once a second unless forced (stop). */
    private void savePosition(boolean force) {
        long now = clock.millis();
        if (lastTimeUs > 0 && (force || now - lastSavedMs >= 1000)) {
            positions.save(SOURCE, Long.toString(lastTimeUs));
            lastSavedMs = now;
        }
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
            e = MAPPER.readTree(json);
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
        savePosition(false);
    }

    private void handlePost(JsonNode e, JsonNode commit) {
        var record = commit.path("record");
        var text = record.path("text").asText("");
        if (!filter.keep(text)) return;
        var did = e.path("did").asText(null);
        var rkey = commit.path("rkey").asText(null);
        var postId = did == null || rkey == null ? null : did + "/" + rkey;
        if (postId != null && seen.isSeen(SOURCE, postId)) return;
        var post = new PostRecord(SchemaVersions.POST, parseTime(record.path("createdAt").asText(null)),
                clock.instant(), SOURCE, postId, did, null, text);
        var key = Keys.postKey(SOURCE, postId);
        boolean offered = false;
        try {
            while (running && !(offered = publisher.offer(Topics.RAW_POSTS, key, post))) Thread.sleep(50); // buffer full: wait
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", ex);
        }
        if (!offered) return; // stopped while waiting: leave it unseen
        if (postId != null) seen.markNew(SOURCE, postId);
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
