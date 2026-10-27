package dev.pumpwatch.common;

import java.math.BigDecimal;
import java.time.Instant;

public record TickRecord(int schemaVersion, Instant eventTime, Instant ingestTime, String ticker, BigDecimal price,
                         long size, String exchange) {}
