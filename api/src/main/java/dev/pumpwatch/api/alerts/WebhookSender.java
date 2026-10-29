package dev.pumpwatch.api.alerts;

import dev.pumpwatch.common.Json;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Posts a message to a webhook. Returns the HTTP status; throws on transport errors (callers must not log the URL). */
interface WebhookSender {
    int post(String url, String message) throws Exception;
}

@Component
class HttpWebhookSender implements WebhookSender {
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Override
    public int post(String url, String message) throws Exception {
        // "text" is read by Slack-style webhooks, "content" by Discord-style ones.
        String body = Json.toJson(Map.of("text", message, "content", message));
        var req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return client.send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
