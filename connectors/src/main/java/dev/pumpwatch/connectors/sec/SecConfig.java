package dev.pumpwatch.connectors.sec;

import dev.pumpwatch.connectors.core.ConnectorPublishers;
import dev.pumpwatch.connectors.core.SeenItems;
import dev.pumpwatch.connectors.core.SourceRegistry;
import java.net.http.HttpClient;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Wires the connector only when {@code pumpwatch.sources.sec.enabled=true}. Needs the database. */
@Configuration
@ConditionalOnProperty(name = "pumpwatch.sources.sec.enabled", havingValue = "true")
@EnableConfigurationProperties(SecProperties.class)
class SecConfig {
    @Bean(initMethod = "start", destroyMethod = "stop")
    SecConnector secConnector(SecProperties props, ConnectorPublishers publishers, SourceRegistry registry,
                              SeenItems seen, JdbcTemplate jdbc, Clock clock) {
        var http = new SecHttp(SecHttp.jdk(HttpClient.newHttpClient()), registry.rateLimiter(SecConnector.NAME),
                registry.userAgent(SecConnector.NAME), d -> Thread.sleep(d));
        var publisher = publishers.create(SecConnector.NAME);
        var sink = new SecConnector.Sink() {
            public boolean offer(String topic, String key, Object record) {
                return publisher.offer(topic, key, record);
            }

            public void markFetched() {
                publisher.markFetched();
            }
        };
        return new SecConnector(props, http, new JdbcTickerStore(jdbc), sink, seen, clock);
    }
}
