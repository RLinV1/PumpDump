package dev.pumpwatch.connectors.alpaca;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicBoolean;

public final class JdkTradeStream implements TradeStream {
    private final HttpClient client;

    public JdkTradeStream(HttpClient client) {
        this.client = client;
    }

    private record Conn(WebSocket ws, AtomicBoolean closedOnce, Listener listener) implements Connection {
        @Override
        public void send(String text) {
            ws.sendText(text, true).join();
        }

        @Override
        public void close() {
            ws.abort();
            // abort() fires neither onClose nor onError, so tell the listener here or its session waits forever
            if (closedOnce.compareAndSet(false, true)) listener.onClose("closed locally");
        }
    }

    @Override
    public Connection open(URI uri, Listener listener) {
        var closedOnce = new AtomicBoolean();
        var text = new StringBuilder();
        return new Conn(client.newWebSocketBuilder().buildAsync(uri, new WebSocket.Listener() {
            @Override
            public CompletionStage<?> onText(WebSocket w, CharSequence data, boolean last) {
                text.append(data);
                if (last) {
                    var msg = text.toString();
                    text.setLength(0);
                    listener.onText(new Conn(w, closedOnce, listener), msg); // blocks while the publisher is full: no request(1) until done
                }
                w.request(1);
                return null;
            }

            @Override
            public CompletionStage<?> onClose(WebSocket w, int code, String reason) {
                if (closedOnce.compareAndSet(false, true)) listener.onClose("closed " + code);
                return null;
            }

            @Override
            public void onError(WebSocket w, Throwable error) {
                if (closedOnce.compareAndSet(false, true)) listener.onClose("error " + error);
            }
        }).join(), closedOnce, listener);
    }
}
