package dev.pumpwatch.common;

import java.time.Instant;

/**
 * A connector's health, published to {@link Topics#SOURCE_HEALTH} (key = source name) every few seconds.
 * {@code unhealthySince} is when the current unhealthy spell began, or null while healthy. eventTime is the report time.
 */
public record SourceHealth(int schemaVersion, Instant eventTime, Instant ingestTime, String source, boolean healthy,
                           Instant unhealthySince) {}
