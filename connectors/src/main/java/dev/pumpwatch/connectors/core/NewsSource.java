package dev.pumpwatch.connectors.core;

import java.time.Duration;

/**
 * An article source. The {@link NewsScheduler} runs each one on its own thread with its own publisher (and so its
 * own health), so a source that fails never affects the others.
 */
public interface NewsSource {
    String name();

    /**
     * True: {@link #run} blocks on a live connection and is restarted after a capped backoff once it returns or
     * throws. False: {@link #run} is one poll cycle, repeated every {@link #interval()} (also after a failure).
     */
    boolean streaming();

    Duration interval();

    /** Publishes through the sink and calls {@link NewsSink#fetched()} after each successful fetch. */
    void run(NewsSink sink) throws Exception;

    /** Called on shutdown; unblock {@link #run} here. */
    default void stop() {}
}
