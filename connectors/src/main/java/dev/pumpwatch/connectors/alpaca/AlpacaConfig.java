package dev.pumpwatch.connectors.alpaca;

import dev.pumpwatch.connectors.core.ConnectorPositions;
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

/** Wires the connector only when {@code pumpwatch.sources.alpaca.enabled=true}. */
@Configuration
@ConditionalOnProperty(name = "pumpwatch.sources.alpaca.enabled", havingValue = "true")
@EnableConfigurationProperties(AlpacaProperties.class)
class AlpacaConfig {
    @Bean(initMethod = "start", destroyMethod = "stop")
    AlpacaConnector alpacaConnector(AlpacaProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                                    ConnectorPublishers publishers, SourceRegistry registry,
                                    SeenItems seen, ConnectorPositions positions, Clock clock) {
        AlpacaConnector.validate(props, watchlist); // fail before creating the publisher
        var client = HttpClient.newHttpClient();
        var history = new HttpTradeHistory(HttpTradeHistory.jdk(client), "https://data.alpaca.markets", props.feed(),
                props.keyId(), props.secretKey(), registry.rateLimiter(AlpacaConnector.NAME), clock);
        return new AlpacaConnector(props, watchlist, publishers.create(AlpacaConnector.NAME), new JdkTradeStream(client),
                history, seen, positions, clock);
    }
}
