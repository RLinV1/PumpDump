package dev.pumpwatch.common;

import java.time.Instant;

public record DeadLetter(String sourceTopic, String reason, String originalPayload, Instant failedAt,
                         int schemaVersion) {}
