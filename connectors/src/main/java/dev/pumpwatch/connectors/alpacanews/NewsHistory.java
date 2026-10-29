package dev.pumpwatch.connectors.alpacanews;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

/** Seam over the REST news endpoint. Empty symbols means all news. */
interface NewsHistory {
    record Page(List<JsonNode> articles, String nextPageToken) {}

    Page news(List<String> symbols, Instant start, Instant end, String pageToken) throws Exception;
}
