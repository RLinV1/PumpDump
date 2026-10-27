package dev.pumpwatch.connectors.core;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/** Test double for the Postgres outbox. */
public class InMemoryOutbox implements OutboxStore {
    private record Stored(String connector, OutboxStore.Row row) {}

    private final List<Stored> rows = new ArrayList<>();
    private final AtomicLong ids = new AtomicLong();

    @Override
    public synchronized long count(String connector) {
        return rows.stream().filter(r -> r.connector().equals(connector)).count();
    }

    @Override
    public synchronized void add(String connector, String topic, String key, String payload) {
        rows.add(new Stored(connector, new OutboxStore.Row(ids.incrementAndGet(), topic, key, payload)));
    }

    @Override
    public synchronized List<OutboxStore.Row> oldest(String connector, int limit) {
        return rows.stream().filter(r -> r.connector().equals(connector)).map(Stored::row).limit(limit).toList();
    }

    @Override
    public synchronized void delete(List<Long> ids) {
        rows.removeIf(r -> ids.contains(r.row().id()));
    }
}
