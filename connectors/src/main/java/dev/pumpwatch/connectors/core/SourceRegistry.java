package dev.pumpwatch.connectors.core;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** Rate limiters and client identification per source. Fails at construction (startup) on missing identification. */
public final class SourceRegistry {
    private final Map<String, SourcesProperties.Source> sources;
    private final Map<String, RateLimiter> limiters = new HashMap<>();

    public SourceRegistry(SourcesProperties props, Clock clock) {
        this.sources = Map.copyOf(props.sources());
        sources.forEach((name, s) -> {
            if (s.enabled() && s.requiresUserAgent() && blank(s.userAgent()))
                throw new IllegalStateException("pumpwatch.sources." + name
                        + ".user-agent is required (set it in the environment, see .env.example)");
            limiters.put(name, new RateLimiter(s.requestsPerMinute(), clock));
        });
    }

    /** Value for the User-Agent header. Never log it alongside credentials; it holds only a contact address. */
    public String userAgent(String source) {
        var ua = source(source).userAgent();
        if (blank(ua)) throw new IllegalStateException("pumpwatch.sources." + source + ".user-agent is not configured");
        return ua;
    }

    public RateLimiter rateLimiter(String source) {
        source(source);
        return limiters.get(source);
    }

    private SourcesProperties.Source source(String name) {
        var s = sources.get(name);
        if (s == null) throw new IllegalArgumentException("unknown source: " + name);
        return s;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
