package dev.pumpwatch.connectors.core;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.DeadLetter;
import dev.pumpwatch.common.FilingRecord;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;

/**
 * Bounded, ack-gated Postgres outbox in front of Kafka for one connector. A row is deleted only after the broker
 * acknowledged it, so a broker outage or a restart loses nothing; when the outbox is full {@link #offer} returns false
 * and health goes DOWN so the connector stops fetching instead of dropping records.
 *
 * <p>Limit: a resend after the delivery timeout can duplicate a record (idempotence only dedupes within one attempt);
 * consumers dedupe by key.
 */
public final class ConnectorPublisher implements AutoCloseable {
    /** Completes when the broker acknowledged the record, fails otherwise. */
    @FunctionalInterface
    public interface Sender {
        CompletableFuture<?> send(String topic, String key, String value);
    }

    private static final Logger log = LoggerFactory.getLogger(ConnectorPublisher.class);

    private final String name;
    private final OutboxStore outbox;
    private final Sender sender;
    private final PumpwatchKafkaProperties props;
    private final Clock clock;
    private final AtomicInteger size; // rows in the outbox for this connector
    private final Counter published;
    private final Counter deadLettered;
    private volatile Instant lastFetch;
    private volatile Instant failingSince;
    private volatile Thread loop;

    public ConnectorPublisher(String name, OutboxStore outbox, Sender sender, PumpwatchKafkaProperties props, MeterRegistry meters,
                              Clock clock) {
        this.name = name;
        this.outbox = outbox;
        this.sender = sender;
        this.props = props;
        this.clock = clock;
        this.size = new AtomicInteger((int) outbox.count(name));
        this.lastFetch = clock.instant(); // start fresh so a new connector is not instantly stale
        this.published = Counter.builder("pumpwatch.connector.published").tag("connector", name).register(meters);
        this.deadLettered = Counter.builder("pumpwatch.connector.dead_letter").tag("connector", name).register(meters);
        Gauge.builder("pumpwatch.connector.buffer.size", size, AtomicInteger::get)
                .tag("connector", name).register(meters);
        Gauge.builder("pumpwatch.connector.last_fetch.age.seconds", this, p -> p.lastFetchAge().toMillis() / 1000.0)
                .tag("connector", name).register(meters);
    }

    /**
     * Validates and queues a record. Returns false only when the buffer is full (the caller must stop fetching and
     * retry the same record later). Invalid records are queued for the dead-letter topic and still return true.
     */
    public boolean offer(String topic, String key, Object record) {
        if (!isAcceptingRecords()) return false;
        String json = Json.toJson(record);
        List<String> problems = problems(record);
        if (problems.isEmpty()) return add(topic, key, json);
        Instant now = clock.instant();
        var dl = new DeadLetter(topic, String.join("; ", problems), json, now, now, SchemaVersions.DEAD_LETTER);
        return add(Topics.INGEST_DLQ, key, Json.toJson(dl));
    }

    private boolean add(String topic, String key, String payload) {
        outbox.add(name, topic, key, payload);
        size.incrementAndGet();
        return true;
    }

    /** False while the buffer is full: the connector must pause fetching. */
    public boolean isAcceptingRecords() {
        return size.get() < props.bufferCapacity();
    }

    public int bufferSize() {
        return size.get();
    }

    /** Call after every successful fetch, even one that returned nothing. */
    public void markFetched() {
        lastFetch = clock.instant();
    }

    public Health health() {
        var reasons = new ArrayList<String>();
        if (!isAcceptingRecords()) reasons.add("buffer full");
        var failing = failingSince;
        if (failing != null && Duration.between(failing, clock.instant()).compareTo(props.brokerDownAfter()) > 0)
            reasons.add("broker failing since " + failing);
        if (lastFetchAge().compareTo(props.maxFetchAge()) > 0) reasons.add("last fetch older than " + props.maxFetchAge());
        var b = reasons.isEmpty() ? Health.up() : Health.down().withDetail("reasons", reasons);
        return b.withDetail("bufferSize", size.get()).withDetail("bufferCapacity", props.bufferCapacity())
                .withDetail("lastFetchAgeSeconds", lastFetchAge().toSeconds()).build();
    }

    /** One pass of the sender loop: sends a batch, deletes the acknowledged prefix. True if the whole batch succeeded. */
    boolean drainOnce() {
        var batch = outbox.oldest(name, props.batchSize());
        if (batch.isEmpty()) return true;
        var pending = new ArrayList<CompletableFuture<?>>();
        boolean ok = true;
        try {
            for (var e : batch) {
                pending.add(sender.send(e.topic(), e.key(), e.payload()));
                // without broker metadata each send blocks max-block and returns already failed: stop, don't try 500
                if (pending.getLast().isCompletedExceptionally()) break;
            }
        } catch (RuntimeException ex) {
            ok = false;
            log.warn("[{}] send failed: {}", name, ex.toString());
        }
        long ackWaitMs = props.deliveryTimeout().plusSeconds(5).toMillis();
        var acked = new ArrayList<Long>();
        for (var f : pending) {
            try {
                f.get(ackWaitMs, TimeUnit.MILLISECONDS);
                var done = batch.get(acked.size());
                // counted on acknowledgement, like published, so a queued-but-unsent dead letter is not counted
                (done.topic().equals(Topics.INGEST_DLQ) ? deadLettered : published).increment();
                acked.add(done.id());
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                ok = false;
                break;
            } catch (Exception ex) {
                ok = false;
                log.warn("[{}] broker did not acknowledge, keeping {} records: {}", name, size.get(), ex.toString());
                break;
            }
        }
        outbox.delete(acked); // exactly the acknowledged rows, in one statement
        size.addAndGet(-acked.size());
        if (ok) failingSince = null;
        else if (failingSince == null) failingSince = clock.instant();
        return ok;
    }

    public void start() {
        if (loop != null) return;
        loop = Thread.ofPlatform().daemon().name("publisher-" + name).start(this::run);
    }

    private void run() {
        long backoff = props.initialBackoff().toMillis();
        try {
            while (!Thread.currentThread().isInterrupted()) {
                if (drainOnceSafely()) {
                    backoff = props.initialBackoff().toMillis();
                    if (size.get() == 0) Thread.sleep(10);
                } else {
                    Thread.sleep(backoff);
                    backoff = Math.min(backoff * 2, props.maxBackoff().toMillis());
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** A database error must not kill the sender thread: treat it like a failed send and back off. */
    private boolean drainOnceSafely() {
        try {
            return drainOnce();
        } catch (RuntimeException ex) {
            log.warn("[{}] outbox error: {}", name, ex.toString());
            return false;
        }
    }

    /** Stops the loop. Rows still in the outbox are sent after the next start. */
    @Override
    public void close() throws InterruptedException {
        var t = loop;
        if (t == null) return;
        t.interrupt();
        t.join(5000);
        loop = null;
    }

    private Duration lastFetchAge() {
        return Duration.between(lastFetch, clock.instant());
    }

    private static List<String> problems(Object r) {
        return switch (r) {
            case TickRecord t -> Validator.validate(t);
            case PostRecord p -> Validator.validate(p);
            case ArticleRecord a -> Validator.validate(a);
            case FilingRecord f -> Validator.validate(f);
            default -> List.of("unsupported record type " + r.getClass().getSimpleName());
        };
    }
}
