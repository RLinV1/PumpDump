package dev.pumpwatch.connectors.core;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;

@Configuration
@EnableConfigurationProperties({PumpwatchKafkaProperties.class, SourcesProperties.class})
public class KafkaProducerConfig {

    /** Idempotent, acks=all producer; values are JSON strings built with common.Json. */
    static Map<String, Object> producerConfig(PumpwatchKafkaProperties p, String bootstrapServers) {
        var m = new HashMap<String, Object>();
        m.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        m.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        m.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        m.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        m.put(ProducerConfig.ACKS_CONFIG, "all");
        m.put(ProducerConfig.RETRIES_CONFIG, p.retries());
        m.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, (int) p.deliveryTimeout().toMillis());
        m.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, (int) p.maxBlock().toMillis());
        m.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, p.maxInFlight());
        return m;
    }

    @Bean
    KafkaTemplate<String, String> kafkaTemplate(PumpwatchKafkaProperties props, KafkaProperties kafka) {
        var servers = String.join(",", kafka.getBootstrapServers());
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerConfig(props, servers)));
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    ConnectorPublishers connectorPublishers(KafkaTemplate<String, String> template, OutboxStore outbox,
                                            PumpwatchKafkaProperties props,
                                            MeterRegistry meters, HealthContributorRegistry health, Clock clock) {
        return new ConnectorPublishers(template, outbox, props, meters, health, clock);
    }

    @Bean
    SourceRegistry sourceRegistry(SourcesProperties sources, Clock clock) {
        return new SourceRegistry(sources, clock);
    }
}
