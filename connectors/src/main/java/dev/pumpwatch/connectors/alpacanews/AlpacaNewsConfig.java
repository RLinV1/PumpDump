package dev.pumpwatch.connectors.alpacanews;

import dev.pumpwatch.connectors.alpaca.HttpTradeHistory;
import dev.pumpwatch.connectors.alpaca.JdkTradeStream;
import dev.pumpwatch.connectors.core.SourceRegistry;
import java.net.http.HttpClient;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Registers the source only when {@code pumpwatch.sources.alpaca-news.enabled=true}; the scheduler runs it. */
@Configuration
@ConditionalOnProperty(name = "pumpwatch.sources.alpaca-news.enabled", havingValue = "true")
@EnableConfigurationProperties(AlpacaNewsProperties.class)
class AlpacaNewsConfig {
    @Bean
    AlpacaNewsSource alpacaNewsSource(AlpacaNewsProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                                      SourceRegistry registry, Clock clock) {
        var client = HttpClient.newHttpClient();
        var history = new HttpNewsHistory(HttpTradeHistory.jdk(client), "https://data.alpaca.markets", props.keyId(),
                props.secretKey(), registry.rateLimiter(AlpacaNewsSource.NAME), clock);
        return new AlpacaNewsSource(props, watchlist, new JdkTradeStream(client), history, clock);
    }
}
