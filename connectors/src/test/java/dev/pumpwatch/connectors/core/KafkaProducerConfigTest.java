package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class KafkaProducerConfigTest {
    @Test
    void producerIsIdempotentAcksAllWithBoundedRetries() {
        var cfg = KafkaProducerConfig.producerConfig(PumpwatchKafkaProperties.defaults(), "broker:9092");
        assertThat(cfg).containsEntry("bootstrap.servers", "broker:9092")
                .containsEntry("enable.idempotence", true)
                .containsEntry("acks", "all")
                .containsEntry("retries", 10)
                .containsEntry("delivery.timeout.ms", 120_000)
                .containsEntry("max.in.flight.requests.per.connection", 5);
    }

    @Test
    void rejectsMoreThanFiveInFlight() {
        assertThatThrownBy(() -> new PumpwatchKafkaProperties(10, Duration.ofMinutes(2), Duration.ofSeconds(10), 6,
                10_000, 500, Duration.ofMillis(100), Duration.ofSeconds(10), Duration.ofSeconds(60),
                Duration.ofSeconds(120)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
