package dev.pumpwatch.common;

import java.time.Instant;
import java.util.List;

public record FilingRecord(int schemaVersion, Instant eventTime, Instant ingestTime, String accessionNumber,
                           String cik, String ticker, String form, List<String> itemCodes) {
    public FilingRecord {
        itemCodes = itemCodes == null ? List.of() : List.copyOf(itemCodes);
    }
}
