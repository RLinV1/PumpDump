package dev.pumpwatch.pipeline.scorer;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;

/**
 * The scorer's health output: Micrometer counters ({@code pumpwatch.scorer.scored}, {@code .dropped},
 * {@code .stale}) and an Actuator indicator. It reports DOWN when unreadable inputs have been dropped more often than
 * windows were scored (at least 10 of them), which means the stage is receiving data it cannot use. The counts are
 * for this process only; they start again after a restart.
 */
public final class ScorerHealth implements HealthIndicator {
    private final String modelVersion;
    private final Counter scoredCounter, droppedCounter, staleCounter;
    private final AtomicLong scored = new AtomicLong(), dropped = new AtomicLong(), stale = new AtomicLong();
    private volatile Instant lastScoredAt;

    public ScorerHealth(String modelVersion, MeterRegistry meters) {
        this.modelVersion = modelVersion;
        scoredCounter = Counter.builder("pumpwatch.scorer.scored").tag("model", modelVersion).register(meters);
        droppedCounter = Counter.builder("pumpwatch.scorer.dropped").tag("model", modelVersion).register(meters);
        staleCounter = Counter.builder("pumpwatch.scorer.stale").tag("model", modelVersion).register(meters);
    }

    void scored(boolean hadStaleSources) {
        scored.incrementAndGet();
        scoredCounter.increment();
        lastScoredAt = Instant.now();
        if (hadStaleSources) {
            stale.incrementAndGet();
            staleCounter.increment();
        }
    }

    void dropped() {
        dropped.incrementAndGet();
        droppedCounter.increment();
    }

    @Override
    public Health health() {
        boolean down = dropped.get() >= 10 && dropped.get() > scored.get();
        return (down ? Health.down() : Health.up()).withDetail("modelVersion", modelVersion)
                .withDetail("scored", scored.get()).withDetail("dropped", dropped.get())
                .withDetail("scoredWithStaleSources", stale.get())
                .withDetail("lastScoredAt", String.valueOf(lastScoredAt)).build();
    }
}
