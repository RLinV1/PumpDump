package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Properties;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** Records accepted before a shutdown are still in Postgres and reach Kafka after the next start. */
@Testcontainers(disabledWithoutDocker = true)
class OutboxRestartTest {
    @Container static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");
    @Container static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.1"));

    @Test
    void rowsOfAStoppedPublisherAreSentByTheNextOne() {
        var props = PumpwatchKafkaProperties.defaults();
        var store = new JdbcOutboxStore(TestDb.migrated(PG));
        var meters = new SimpleMeterRegistry();

        // first "process": accepts records but never runs its sender loop, then goes away
        var before = new ConnectorPublisher("restart", store, (t, k, v) -> null, props, meters, Clock.systemUTC());
        for (int i = 0; i < 3; i++) assertThat(before.offer(Topics.TICKS, "AAA", tick(i))).isTrue();
        assertThat(store.count("restart")).isEqualTo(3);

        var cfg = new HashMap<String, Object>(KafkaProducerConfig.producerConfig(props, KAFKA.getBootstrapServers()));
        var template = new KafkaTemplate<>(new DefaultKafkaProducerFactory<String, String>(cfg));
        var after = new ConnectorPublisher("restart", store, template::send, props, new SimpleMeterRegistry(),
                Clock.systemUTC());
        assertThat(after.bufferSize()).isEqualTo(3);
        after.start();
        long deadline = System.currentTimeMillis() + 30_000;
        while (store.count("restart") > 0 && System.currentTimeMillis() < deadline) Thread.onSpinWait();
        assertThat(store.count("restart")).isZero();

        var cp = new Properties();
        cp.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        cp.put(ConsumerConfig.GROUP_ID_CONFIG, "restart-" + System.nanoTime());
        cp.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        cp.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        cp.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        int seen = 0;
        try (var consumer = new KafkaConsumer<String, String>(cp)) {
            consumer.subscribe(java.util.List.of(Topics.TICKS));
            long end = System.currentTimeMillis() + 30_000;
            while (seen < 3 && System.currentTimeMillis() < end) seen += consumer.poll(Duration.ofMillis(500)).count();
        }
        assertThat(seen).isEqualTo(3);
    }

    private static TickRecord tick(long seq) {
        var now = Instant.now();
        return new TickRecord(SchemaVersions.TICK, now, now, "AAA", BigDecimal.ONE, seq + 1, "X");
    }
}
