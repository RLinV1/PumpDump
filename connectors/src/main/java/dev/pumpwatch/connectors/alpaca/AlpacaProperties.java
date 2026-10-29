package dev.pumpwatch.connectors.alpaca;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code pumpwatch.sources.alpaca.*}; defaults are the free plan. */
@ConfigurationProperties("pumpwatch.sources.alpaca")
public record AlpacaProperties(@DefaultValue("false") boolean enabled,
                               @DefaultValue("150") int requestsPerMinute,
                               @DefaultValue("free") String plan,
                               @DefaultValue("iex") String feed,
                               @DefaultValue("30") int symbolLimit,
                               String keyId,
                               String secretKey) {
    /** Never prints credentials. */
    @Override
    public String toString() {
        return "AlpacaProperties[enabled=" + enabled + ", plan=" + plan + ", feed=" + feed
                + ", symbolLimit=" + symbolLimit + "]";
    }
}
