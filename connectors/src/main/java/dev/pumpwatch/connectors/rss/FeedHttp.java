package dev.pumpwatch.connectors.rss;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Seam over the conditional GET so tests can fake it. */
interface FeedHttp {
    record Response(int status, byte[] body, String etag, String lastModified) {}

    Response get(URI uri, String ifNoneMatch, String ifModifiedSince) throws IOException, InterruptedException;

    static FeedHttp jdk(HttpClient client) {
        return (uri, inm, ims) -> {
            var b = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
                    .header("User-Agent", "pumpwatch/0.1 (news ingestion)").GET();
            if (inm != null) b.header("If-None-Match", inm);
            if (ims != null) b.header("If-Modified-Since", ims);
            var r = client.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
            return new Response(r.statusCode(), r.body(), r.headers().firstValue("ETag").orElse(null),
                    r.headers().firstValue("Last-Modified").orElse(null));
        };
    }
}
