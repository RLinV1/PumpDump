package dev.pumpwatch.connectors.alpaca;

import java.time.Instant;
import java.util.List;

/** Seam over the REST historical trades endpoint. */
interface TradeHistory {
    record Page(List<Trade> trades, String nextPageToken) {}

    Page trades(List<String> symbols, Instant start, Instant end, String pageToken) throws Exception;
}
