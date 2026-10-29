package dev.pumpwatch.connectors.core;

/**
 * A data source. Implementations create their publisher via {@link ConnectorPublishers#create(String)}, call
 * {@link ConnectorPublisher#markFetched()} after each successful fetch, and stop fetching while
 * {@link ConnectorPublisher#isAcceptingRecords()} is false (or when {@code offer} returns false).
 */
public interface Connector {
    String name();

    void start();

    void stop();
}
