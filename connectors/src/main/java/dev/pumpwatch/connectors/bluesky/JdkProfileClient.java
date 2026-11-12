package dev.pumpwatch.connectors.bluesky;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** {@code app.bsky.actor.getProfiles} on the public AppView (no auth, 25 actors per call). */
public class JdkProfileClient implements ProfileClient {
    private static final ObjectMapper MAPPER = Json.newMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    @Override
    public Map<String, Instant> createdAt(List<String> dids) throws Exception {
        String query = dids.stream().map(d -> "actors=" + URLEncoder.encode(d, StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        var request = HttpRequest.newBuilder(
                        URI.create("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?" + query))
                .timeout(Duration.ofSeconds(3)).GET().build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new java.io.IOException("getProfiles HTTP " + response.statusCode());
        Map<String, Instant> out = new HashMap<>();
        for (var p : MAPPER.readTree(response.body()).path("profiles")) {
            var created = p.path("createdAt").asText(null);
            if (created != null) out.put(p.path("did").asText(), OffsetDateTime.parse(created).toInstant());
        }
        return out;
    }
}
