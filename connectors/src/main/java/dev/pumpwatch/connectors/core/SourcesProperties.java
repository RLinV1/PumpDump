package dev.pumpwatch.connectors.core;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Per-source settings under {@code pumpwatch.sources.<name>.*}. */
@ConfigurationProperties("pumpwatch")
public record SourcesProperties(@DefaultValue Map<String, Source> sources) {

    /**
     * @param requestsPerMinute set BELOW the source's published limit, never at it
     * @param userAgent         descriptive client name, read from the environment (never logged)
     * @param requiresUserAgent startup fails if true, enabled and userAgent is blank
     */
    public record Source(@DefaultValue("60") int requestsPerMinute, String userAgent,
                         @DefaultValue("false") boolean requiresUserAgent,
                         @DefaultValue("false") boolean enabled) {}
}
