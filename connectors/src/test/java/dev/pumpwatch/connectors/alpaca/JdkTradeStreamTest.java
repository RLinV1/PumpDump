package dev.pumpwatch.connectors.alpaca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class JdkTradeStreamTest {

    /** WebSocket.abort() fires no onClose, so a local close() must end the session itself, exactly once. */
    @Test
    void localCloseNotifiesTheListenerOnce() {
        var ws = mock(WebSocket.class);
        var builder = mock(WebSocket.Builder.class);
        var client = mock(HttpClient.class);
        var jdkListener = new AtomicReference<WebSocket.Listener>();
        when(client.newWebSocketBuilder()).thenReturn(builder);
        when(builder.buildAsync(any(), any())).thenAnswer(inv -> {
            jdkListener.set(inv.getArgument(1));
            return CompletableFuture.completedFuture(ws);
        });
        List<String> closes = new ArrayList<>();

        var conn = new JdkTradeStream(client).open(URI.create("wss://example.test"), new TradeStream.Listener() {
            @Override public void onText(TradeStream.Connection c, String text) { }
            @Override public void onClose(String reason) { closes.add(reason); }
        });
        conn.close();
        conn.close();
        jdkListener.get().onClose(ws, 1000, "late close event"); // a real close arriving afterwards is ignored

        verify(ws, org.mockito.Mockito.times(2)).abort();
        assertThat(closes).containsExactly("closed locally");
    }
}
