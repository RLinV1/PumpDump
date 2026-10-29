package dev.pumpwatch.connectors.core;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Test double for the connector_positions table. */
public class FakePositions extends ConnectorPositions {
    public final Map<String, String> saved = new ConcurrentHashMap<>();

    public FakePositions() {
        super(null);
    }

    @Override
    public String load(String source) {
        return saved.get(source);
    }

    @Override
    public void save(String source, String value) {
        saved.put(source, value);
    }
}
