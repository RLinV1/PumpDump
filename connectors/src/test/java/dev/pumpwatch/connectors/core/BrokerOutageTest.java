package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import dev.pumpwatch.common.Topics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

/** Task 3.5: a 30 second broker outage loses nothing, duplicates nothing and keeps per-key order. */
@Testcontainers(disabledWithoutDocker = true)
class BrokerOutageTest {
    @Container
    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.1"));
    @Container
    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void pausedBrokerLosesNothingAndKeepsPerKeyOrder() throws Exception {
        var props = new PumpwatchKafkaProperties(10, Duration.ofMinutes(2), Duration.ofSeconds(5), 5, 10_000, 200,
                Duration.ofMillis(100), Duration.ofSeconds(2), Duration.ofSeconds(60), Duration.ofSeconds(120));
        var cfg = new HashMap<String, Object>(KafkaProducerConfig.producerConfig(props, KAFKA.getBootstrapServers()));
        var template = new KafkaTemplate<>(new DefaultKafkaProducerFactory<String, String>(cfg));
        var publisher = new ConnectorPublisher("it", new JdbcOutboxStore(TestDb.migrated(PG)), template::send, props, new SimpleMeterRegistry(),
                Clock.systemUTC());
        publisher.start();

        String[] keys = {"AAA", "BBB", "CCC"};
        int total = 0;
        var dockerClient = KAFKA.getDockerClient();
        // warm up so metadata is cached, then cut the broker
        for (int i = 0; i < 3; i++) assertThat(publisher.offer(Topics.TICKS, keys[i], tick(keys[i], total++))).isTrue();
        awaitDrained(publisher, Duration.ofSeconds(30));
        dockerClient.pauseContainerCmd(KAFKA.getContainerId()).exec();
        long end = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < end) {
            String k = keys[total % keys.length];
            assertThat(publisher.offer(Topics.TICKS, k, tick(k, total++))).isTrue();
            Thread.sleep(100);
        }
        dockerClient.unpauseContainerCmd(KAFKA.getContainerId()).exec();
        awaitDrained(publisher, Duration.ofSeconds(90));
        publisher.close();

        Map<String, List<Long>> bySeq = consumeAll(total);
        List<Long> all = new ArrayList<>();
        bySeq.values().forEach(all::addAll);
        assertThat(all).hasSize(total).doesNotHaveDuplicates();
        bySeq.values().forEach(seqs -> assertThat(seqs).isSorted());
    }

    private static TickRecord tick(String ticker, long seq) {
        var now = Instant.now();
        return new TickRecord(SchemaVersions.TICK, now, now, ticker, BigDecimal.ONE, seq + 1, "X");
    }

    private static void awaitDrained(ConnectorPublisher p, Duration max) throws InterruptedException {
        long deadline = System.currentTimeMillis() + max.toMillis();
        while (p.bufferSize() > 0 && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertThat(p.bufferSize()).isZero();
    }

    private static Map<String, List<Long>> consumeAll(int expected) {
        var cp = new Properties();
        cp.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        cp.put(ConsumerConfig.GROUP_ID_CONFIG, "it-" + System.nanoTime());
        cp.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        cp.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        cp.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        Map<String, List<Long>> out = new HashMap<>();
        int seen = 0;
        try (var consumer = new KafkaConsumer<String, String>(cp)) {
            consumer.subscribe(List.of(Topics.TICKS));
            long deadline = System.currentTimeMillis() + 60_000;
            // keep polling a little past the expected count so extra duplicates would show up
            long grace = 0;
            while (System.currentTimeMillis() < deadline && (seen < expected || System.currentTimeMillis() < grace)) {
                for (var r : consumer.poll(Duration.ofMillis(500))) {
                    out.computeIfAbsent(r.key(), k -> new ArrayList<>())
                            .add(Json.fromJson(r.value(), TickRecord.class).size());
                    if (++seen == expected) grace = System.currentTimeMillis() + 3000;
                }
            }
        }
        return out;
    }
}
