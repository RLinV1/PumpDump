package dev.pumpwatch.connectors.bluesky;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.function.Consumer;

/** JDK java.net.http WebSocket. Not unit tested: it needs a live Jetstream. */
public final class JdkJetstreamClient implements JetstreamClient {
    @Override
    public void connect(URI uri, Consumer<String> onMessage) throws Exception {
        var closed = new CompletableFuture<Void>();
        var buf = new StringBuilder();
        var listener = new WebSocket.Listener() {
            @Override public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                buf.append(data);
                if (last) {
                    var msg = buf.toString();
                    buf.setLength(0);
                    try {
                        onMessage.accept(msg);
                    } catch (RuntimeException e) {
                        closed.completeExceptionally(e);
                        ws.abort();
                        return null;
                    }
                }
                ws.request(1);
                return null;
            }

            @Override public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
                closed.complete(null);
                return null;
            }

            @Override public void onError(WebSocket ws, Throwable error) {
                closed.completeExceptionally(error);
            }
        };
        HttpClient.newHttpClient().newWebSocketBuilder().buildAsync(uri, listener).get();
        closed.get();
    }
}
