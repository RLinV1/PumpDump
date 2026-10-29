package dev.pumpwatch.connectors.core;

import java.util.List;

/** Durable queue behind {@link ConnectorPublisher}: rows stay until the broker acknowledged them. */
public interface OutboxStore {
    record Row(long id, String topic, String key, String payload) {}

    long count(String connector);

    void add(String connector, String topic, String key, String payload);

    /** Oldest rows first, so sending in this order keeps per-key order. */
    List<Row> oldest(String connector, int limit);

    void delete(List<Long> ids);
}
