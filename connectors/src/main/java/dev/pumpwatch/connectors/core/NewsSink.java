package dev.pumpwatch.connectors.core;

import dev.pumpwatch.common.ArticleRecord;
import dev.pumpwatch.common.Topics;
import java.util.function.BiPredicate;
import java.util.function.BooleanSupplier;

/** What a {@link NewsSource} publishes through: drops items already seen (source + item id) and keys by item id. */
public final class NewsSink {
    private final ConnectorPublisher publisher;
    private final BiPredicate<String, String> markNew;
    private final BooleanSupplier stopped;

    public NewsSink(ConnectorPublisher publisher, BiPredicate<String, String> markNew, BooleanSupplier stopped) {
        this.publisher = publisher;
        this.markNew = markNew;
        this.stopped = stopped;
    }

    /** Waits while the buffer is full. True if the record was new and queued. */
    public synchronized boolean publish(ArticleRecord a) {
        try {
            while (!publisher.isAcceptingRecords() && !stopped.getAsBoolean()) Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
        if (stopped.getAsBoolean() || !markNew.test(a.source(), a.itemId())) return false;
        return publisher.offer(Topics.RAW_NEWS, a.itemId(), a);
    }

    public void fetched() {
        publisher.markFetched();
    }
}
