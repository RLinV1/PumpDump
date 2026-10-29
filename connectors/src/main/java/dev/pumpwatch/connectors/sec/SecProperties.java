package dev.pumpwatch.connectors.sec;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code pumpwatch.sources.sec.*} settings beyond the shared ones (rate, user agent, enabled). Nulls take defaults. */
@ConfigurationProperties("pumpwatch.sources.sec")
public record SecProperties(String feedUrl, String tickersUrl, Duration pollInterval, Duration tickerRefresh) {
    static final String DEFAULT_FEED_URL =
            "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom";
    static final String DEFAULT_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

    public SecProperties {
        if (feedUrl == null) feedUrl = DEFAULT_FEED_URL;
        if (tickersUrl == null) tickersUrl = DEFAULT_TICKERS_URL;
        if (pollInterval == null) pollInterval = Duration.ofSeconds(60);
        if (tickerRefresh == null) tickerRefresh = Duration.ofHours(24);
    }
}
