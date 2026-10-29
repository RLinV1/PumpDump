package dev.pumpwatch.replay;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Headers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
class ReplayIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");
    @Container static KafkaContainer kafka =
            new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.1"));

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
        r.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired KafkaTemplate<String, String> template;
    @Autowired EventStore store;
    @Autowired Replayer replayer;

    @Test
    void recordsThenReplaysInOrderWithHeaders() throws Exception {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        // sent out of event-time order on purpose
        for (int s : new int[] {2, 0, 1}) {
            template.send("ticks", "ABC", "{\"eventTime\":\"" + t0.plusSeconds(s) + "\",\"s\":" + s + "}").get();
        }
        Awaitility.await().atMost(Duration.ofSeconds(60)).until(() -> store.count() == 3);

        String runId = UUID.randomUUID().toString();
        replayer.run(runId, t0, t0.plusSeconds(10), 1000, false);

        List<ConsumerRecord<String, String>> replayed = new ArrayList<>();
        try (KafkaConsumer<String, String> c = new KafkaConsumer<>(Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "verify-" + runId,
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest"),
                new StringDeserializer(), new StringDeserializer())) {
            c.subscribe(List.of("ticks"));
            Awaitility.await().atMost(Duration.ofSeconds(30)).until(() -> {
                c.poll(Duration.ofMillis(500)).forEach(r -> {
                    if (r.headers().lastHeader(Headers.REPLAY) != null) {
                        replayed.add(r);
                    }
                });
                return replayed.size() >= 3;
            });
        }
        assertThat(replayed).extracting(ConsumerRecord::value)
                .extracting(v -> v.replaceAll(".*\"s\":(\\d).*", "$1")).containsExactly("0", "1", "2");
        assertThat(new String(replayed.get(0).headers().lastHeader(Headers.RUN_ID).value(), StandardCharsets.UTF_8))
                .isEqualTo(runId);
        assertThat(store.count()).isEqualTo(3); // replays are not re-recorded
    }
}
