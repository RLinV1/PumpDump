package dev.pumpwatch.connectors.alpaca;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;

/** One Alpaca trade, from either the stream ({@code S} holds the symbol) or the historical endpoint. */
record Trade(String symbol, BigDecimal price, long size, Instant time, String exchange, String id) {
    static Trade parse(JsonNode n, String symbol) {
        return new Trade(symbol, n.get("p").decimalValue(), n.path("s").asLong(), Instant.parse(n.get("t").asText()),
                n.path("x").asText(null), n.path("i").asText());
    }

    String dedupeKey() {
        return symbol + ":" + id;
    }
}
