package dev.pumpwatch.replay;

import java.time.Instant;

public record RecordedEvent(long id, String topic, String key, Instant eventTime, String payload) {}
