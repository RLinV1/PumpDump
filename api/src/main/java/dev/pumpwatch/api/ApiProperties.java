package dev.pumpwatch.api;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("api")
public record ApiProperties(
        @DefaultValue List<String> allowedOrigins,
        @DefaultValue("120") int rateLimitPerMinute,
        @DefaultValue("30") int burst,
        @DefaultValue("PT15S") Duration heartbeat,
        @DefaultValue("PT1S") Duration pollInterval,
        @DefaultValue("100") int maxStreams) {}
