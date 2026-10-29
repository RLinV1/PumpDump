package dev.pumpwatch.connectors.bluesky;

import java.net.URI;
import java.util.function.Consumer;

/** The WebSocket, behind a seam so tests can fake it. */
public interface JetstreamClient {
    /**
     * Connects and delivers each text message to {@code onMessage}, one at a time (the next is not read until the
     * handler returns, which is the backpressure). Blocks until the connection closes; throws if it fails.
     */
    void connect(URI uri, Consumer<String> onMessage) throws Exception;
}
