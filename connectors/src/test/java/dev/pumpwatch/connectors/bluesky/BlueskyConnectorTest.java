package dev.pumpwatch.connectors.bluesky;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.DeadLetter;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.connectors.core.ConnectorPublisher;
import dev.pumpwatch.connectors.core.PumpwatchKafkaProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class BlueskyConnectorTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-27T12:05:00Z"), ZoneOffset.UTC);
    private static final BlueskyProperties PROPS = new BlueskyProperties(true, "wss://example.test/subscribe",
            List.of("stock", "shares", "short squeeze"));

    private final List<String[]> sent = new CopyOnWriteArrayList<>(); // topic, key, value
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private ConnectorPublisher publisher;
    private BlueskyConnector connector;

    @AfterEach
    void tearDown() throws Exception {
        if (connector != null) connector.stop();
        if (publisher != null) publisher.close();
    }

    /** Fake socket: each connect() replays the next scripted batch and returns, as if the server closed. */
    private static final class Fake implements JetstreamClient {
        final List<URI> uris = new CopyOnWriteArrayList<>();
        final List<List<String>> batches;
        Fake(List<List<String>> batches) { this.batches = batches; }

        @Override public void connect(URI uri, Consumer<String> onMessage) throws Exception {
            int i = uris.size();
            uris.add(uri);
            if (i >= batches.size()) { Thread.sleep(60_000); return; }
            batches.get(i).forEach(onMessage);
        }
    }

    private Fake run(List<List<String>> batches) throws Exception {
        publisher = new ConnectorPublisher("bluesky", (t, k, v) -> {
            sent.add(new String[] {t, k, v});
            return CompletableFuture.completedFuture(null);
        }, PumpwatchKafkaProperties.defaults(), meters, CLOCK);
        publisher.start();
        var fake = new Fake(batches);
        connector = new BlueskyConnector(PROPS, List.of("GME", "AMC", "SNDL"), publisher,
                BlueskyConnector.dedupe(null), fake, meters, CLOCK, Duration.ofMillis(1), Duration.ofMillis(4));
        connector.start();
        return fake;
    }

    private static List<String> lines(String resource) throws Exception {
        return Files.readAllLines(Path.of(BlueskyConnectorTest.class.getResource("/bluesky/" + resource).toURI()));
    }

    private void await(BooleanSupplier c) throws Exception {
        for (int i = 0; i < 500 && !c.getAsBoolean(); i++) Thread.sleep(10);
        assertThat(c.getAsBoolean()).isTrue();
    }

    @Test
    void keepsCashtagAndFinanceTermPostsAndNormalizes() throws Exception {
        run(List.of(lines("jetstream-sample.jsonl")));
        await(() -> sent.size() >= 2);
        Thread.sleep(100);
        assertThat(sent).hasSize(2); // boring, bare ticker, delete and identity events are dropped
        assertThat(sent).allSatisfy(s -> assertThat(s[0]).isEqualTo(Topics.RAW_POSTS));
        assertThat(sent.get(0)[1]).isEqualTo("bluesky:did:plc:aaa/3kcash");
        var p = Json.fromJson(sent.get(0)[2], PostRecord.class);
        assertThat(p.source()).isEqualTo("bluesky");
        assertThat(p.postId()).isEqualTo("did:plc:aaa/3kcash");
        assertThat(p.authorId()).isEqualTo("did:plc:aaa");
        assertThat(p.authorCreatedAt()).isNull();
        assertThat(p.text()).isEqualTo("Loading up on $GME today");
        assertThat(p.eventTime()).isEqualTo(Instant.parse("2026-10-27T12:00:00Z"));
        assertThat(p.ingestTime()).isEqualTo(Instant.parse("2026-10-27T12:05:00Z"));
        assertThat(Json.fromJson(sent.get(1)[2], PostRecord.class).postId()).isEqualTo("did:plc:bbb/3kterm");
    }

    @Test
    void duplicateAfterReconnectIsPublishedOnceAndCursorResumes() throws Exception {
        var all = lines("jetstream-sample.jsonl");
        var fake = run(List.of(all, all.subList(0, 2)));
        await(() -> fake.uris.size() >= 3); // first, reconnect (replays), reconnect again
        Thread.sleep(100);
        assertThat(sent).hasSize(2);
        assertThat(fake.uris.get(0).toString()).isEqualTo(
                "wss://example.test/subscribe?wantedCollections=app.bsky.feed.post");
        // last time_us in the sample is ...600; resume 5 seconds earlier
        assertThat(fake.uris.get(1).toString()).endsWith("&cursor=" + (1790000000000600L - 5_000_000L));
    }

    @Test
    void malformedMessagesAreCountedOrDeadLettered() throws Exception {
        run(List.of(lines("jetstream-bad.jsonl")));
        await(() -> sent.size() >= 1);
        assertThat(sent.get(0)[0]).isEqualTo(Topics.INGEST_DLQ);
        assertThat(Json.fromJson(sent.get(0)[2], DeadLetter.class).reason()).contains("eventTime");
        assertThat(meters.get("pumpwatch.bluesky.unparseable").counter().count()).isEqualTo(1.0);
        assertThat(new ArrayList<>(sent)).hasSize(1);
    }
}
