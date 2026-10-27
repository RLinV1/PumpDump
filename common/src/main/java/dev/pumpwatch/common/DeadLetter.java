package dev.pumpwatch.common;

import java.time.Instant;

/** failedAt is the event time. */
public record DeadLetter(String sourceTopic, String reason, String originalPayload, Instant failedAt,
                         Instant ingestTime,
                         int schemaVersion) {}
