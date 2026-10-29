package dev.pumpwatch.pipeline.features;

import io.micrometer.core.instrument.Counter;
import org.apache.kafka.streams.processor.api.ContextualFixedKeyProcessor;
import org.apache.kafka.streams.processor.api.FixedKeyRecord;

/**
 * Pass-through that counts records arriving later than the lateness bound: older (by event time) than the newest
 * event this task has seen minus {@link FeatureStage#GRACE}. Such a record misses the windows it belongs to, which
 * have already closed, so it never changes an emitted feature. One instance per task, so the newest-seen time is
 * per partition; it is only a metric and starts over after a restart.
 */
final class LateCounter<V> extends ContextualFixedKeyProcessor<String, V, V> {
    private final Counter late;
    private long newest = Long.MIN_VALUE;

    LateCounter(Counter late) {
        this.late = late;
    }

    @Override
    public void process(FixedKeyRecord<String, V> r) {
        if (newest != Long.MIN_VALUE && r.timestamp() < newest - FeatureStage.GRACE.toMillis()) late.increment();
        newest = Math.max(newest, r.timestamp());
        context().forward(r);
    }
}
