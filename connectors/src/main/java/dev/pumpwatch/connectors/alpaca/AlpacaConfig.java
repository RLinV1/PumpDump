package dev.pumpwatch.connectors.alpaca;

import dev.pumpwatch.connectors.core.ConnectorPublishers;
import dev.pumpwatch.connectors.core.SeenItems;
import dev.pumpwatch.connectors.core.SourceRegistry;
import java.net.http.HttpClient;
import java.time.Clock;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import org.springframework.beans.factory.ObjectProvider;
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
    private static final int MEMORY_DEDUPE_CAPACITY = 200_000;

    @Bean(initMethod = "start", destroyMethod = "stop")
    AlpacaConnector alpacaConnector(AlpacaProperties props, @Value("${pumpwatch.watchlist}") List<String> watchlist,
                                    ConnectorPublishers publishers, SourceRegistry registry,
                                    ObjectProvider<SeenItems> seen, Clock clock) {
        AlpacaConnector.validate(props, watchlist); // fail before creating the publisher
        var client = HttpClient.newHttpClient();
        var seenItems = seen.getIfAvailable();
        Predicate<String> markNew = seenItems != null
                ? key -> seenItems.markNew(AlpacaConnector.NAME, key)
                : inMemory(MEMORY_DEDUPE_CAPACITY);
        var history = new HttpTradeHistory(HttpTradeHistory.jdk(client), "https://data.alpaca.markets", props.feed(),
                props.keyId(), props.secretKey(), registry.rateLimiter(AlpacaConnector.NAME), clock);
        return new AlpacaConnector(props, watchlist, publishers.create(AlpacaConnector.NAME), new JdkTradeStream(client),
                history, markNew, clock);
    }

    /** shortcut: forgets trades beyond the newest {@code capacity} and everything on restart; SeenItems is durable. */
    static Predicate<String> inMemory(int capacity) {
        Map<String, Boolean> seen = Collections.synchronizedMap(new LinkedHashMap<>() {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Boolean> e) {
                return size() > capacity;
            }
        });
        return key -> seen.put(key, Boolean.TRUE) == null;
    }
}
