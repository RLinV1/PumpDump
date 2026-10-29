package dev.pumpwatch.connectors.finnhub;

import java.util.Optional;

/** Durable key/value state (table {@code finnhub_state}); nothing that must survive a restart lives in memory. */
interface FinnhubState {
    Optional<String> get(String name);

    void put(String name, String value);
}
