package dev.pumpwatch.connectors.alpaca;

import java.net.URI;

/** Seam over the WebSocket so tests can fake it. Callbacks arrive one at a time; a slow callback applies backpressure. */
public interface TradeStream {
    interface Connection {
        void send(String text);

        void close();
    }

    interface Listener {
        void onText(Connection c, String text);

        /** Called once when the connection ends for any reason (close or error). */
        void onClose(String reason);
    }

    Connection open(URI uri, Listener listener);
}
