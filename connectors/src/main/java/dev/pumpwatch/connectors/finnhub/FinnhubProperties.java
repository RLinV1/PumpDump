package dev.pumpwatch.connectors.finnhub;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code pumpwatch.sources.finnhub.*}; the free plan allows 60 calls per minute, so the default stays below it. */
@ConfigurationProperties("pumpwatch.sources.finnhub")
public record FinnhubProperties(@DefaultValue("false") boolean enabled,
                                String token,
                                @DefaultValue("50") int requestsPerMinute,
                                @DefaultValue("1m") Duration pollInterval,
                                @DefaultValue("2") int lookbackDays) {
    /** Never prints the token. */
    @Override
    public String toString() {
        return "FinnhubProperties[enabled=" + enabled + ", requestsPerMinute=" + requestsPerMinute
                + ", pollInterval=" + pollInterval + ", lookbackDays=" + lookbackDays + "]";
    }
}
