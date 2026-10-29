package dev.pumpwatch.replay;

import dev.pumpwatch.common.Headers;
import dev.pumpwatch.common.Topics;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class Replayer {
    static final int PAGE = 500;
    /** Gaps below this are accumulated instead of slept, so tiny sleeps do not distort the pace. */
    static final Duration MIN_SLEEP = Duration.ofMillis(5);
    private static final Logger log = LoggerFactory.getLogger(Replayer.class);

    private final EventSource source;
    private final Sink sink;
    private final Sleeper sleeper;
    private final Executor executor;

    public Replayer(EventSource source, Sink sink, Sleeper sleeper, Executor replayExecutor) {
        this.source = source;
        this.sink = sink;
        this.sleeper = sleeper;
        this.executor = replayExecutor;
    }

    /** Starts a replay on its own thread and returns the run id immediately. */
    public String start(Instant from, Instant to, double speed, boolean isolated) {
        validate(from, to, speed);
        String runId = UUID.randomUUID().toString();
        executor.execute(() -> {
            try {
                run(runId, from, to, speed, isolated);
            } catch (Exception e) {
                log.error("replay {} failed", runId, e);
            }
        });
        return runId;
    }

    static void validate(Instant from, Instant to, double speed) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw new IllegalArgumentException("from must be before to");
        }
        if (!(speed > 0) || Double.isInfinite(speed)) {
            throw new IllegalArgumentException("speed must be a positive number");
        }
    }

    /** Synchronous replay; returns the number of records published. */
    public long run(String runId, Instant from, Instant to, double speed, boolean isolated) throws Exception {
        validate(from, to, speed);
        long sent = 0;
        Instant prev = null;
        Duration owed = Duration.ZERO;
        Instant afterTime = from.minusSeconds(1);
        long afterId = Long.MIN_VALUE;
        while (true) {
            List<RecordedEvent> page = source.page(from, to, afterTime, afterId, PAGE);
            if (page.isEmpty()) {
                return sent;
            }
            for (RecordedEvent e : page) {
                if (prev != null) {
                    owed = owed.plusNanos((long) (Duration.between(prev, e.eventTime()).toNanos() / speed));
                    if (owed.compareTo(MIN_SLEEP) >= 0) {
                        sleeper.sleep(owed);
                        owed = Duration.ZERO;
                    }
                }
                prev = e.eventTime();
                String topic = isolated ? Topics.forRun(e.topic(), runId) : e.topic();
                ProducerRecord<String, String> pr =
                        new ProducerRecord<>(topic, e.key().isEmpty() ? null : e.key(), e.payload());
                pr.headers().add(Headers.REPLAY, "true".getBytes(StandardCharsets.UTF_8));
                pr.headers().add(Headers.RUN_ID, runId.getBytes(StandardCharsets.UTF_8));
                sink.send(pr);
                sent++;
                afterTime = e.eventTime();
                afterId = e.id();
            }
        }
    }

    @FunctionalInterface
    public interface Sink {
        void send(ProducerRecord<String, String> record) throws Exception;
    }

    @FunctionalInterface
    public interface Sleeper {
        void sleep(Duration d) throws InterruptedException;
    }
}
