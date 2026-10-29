package dev.pumpwatch.connectors.alpacanews;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code pumpwatch.sources.alpaca-news.*}; credentials are the same ALPACA_KEY_ID / ALPACA_SECRET_KEY as market data. */
@ConfigurationProperties("pumpwatch.sources.alpaca-news")
public record AlpacaNewsProperties(@DefaultValue("false") boolean enabled,
                                   @DefaultValue("150") int requestsPerMinute,
                                   String keyId,
                                   String secretKey,
                                   @DefaultValue("false") boolean subscribeAll,
                                   @DefaultValue("60") int backfillMinutes) {
    /** Never prints credentials. */
    @Override
    public String toString() {
        return "AlpacaNewsProperties[enabled=" + enabled + ", subscribeAll=" + subscribeAll
                + ", backfillMinutes=" + backfillMinutes + "]";
    }
}
