package dev.pumpwatch.connectors.finnhub;

import dev.pumpwatch.connectors.core.ConnectorPublishers;
import dev.pumpwatch.connectors.core.SeenItems;
import dev.pumpwatch.connectors.core.SourceRegistry;
import java.net.http.HttpClient;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Wires the connector only when {@code pumpwatch.sources.finnhub.enabled=true}. */
@Configuration
@ConditionalOnProperty(name = "pumpwatch.sources.finnhub.enabled", havingValue = "true")
@EnableConfigurationProperties(FinnhubProperties.class)
class FinnhubConfig {
    @Bean(initMethod = "start", destroyMethod = "stop")
    FinnhubConnector finnhubConnector(FinnhubProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                                      ConnectorPublishers publishers, SourceRegistry registry, SeenItems seen,
                                      JdbcTemplate jdbc, Clock clock) {
        var tickers = FinnhubConnector.validate(props, watchlist); // fail before creating the publisher
        var limiter = registry.rateLimiter(FinnhubConnector.NAME);
        var api = new FinnhubApi(FinnhubApi.jdk(HttpClient.newHttpClient()), FinnhubApi.BASE_URL, props.token(),
                limiter, limiter::acquire, clock);
        return new FinnhubConnector(props, tickers, publishers.create(FinnhubConnector.NAME), api, seen,
                new JdbcFinnhubState(jdbc), clock);
    }
}
