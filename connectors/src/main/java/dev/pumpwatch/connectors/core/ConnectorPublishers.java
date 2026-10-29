package dev.pumpwatch.connectors.core;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * Creates one started publisher per connector name and registers its health contributor. Every 15 seconds each
 * publisher's health is also sent to the source-health topic, which is how the pipeline learns a source is unhealthy.
 * Limit: the report goes straight to the broker, not through the outbox, so while the broker is unreachable no report
 * arrives and the last one stands.
 */
public class ConnectorPublishers {
    private final KafkaTemplate<String, String> template;
    private final OutboxStore outbox;
    private final PumpwatchKafkaProperties props;
    private final MeterRegistry meters;
    private final HealthContributorRegistry health;
    private final Clock clock;
    private final List<ConnectorPublisher> created = new CopyOnWriteArrayList<>();
    private ScheduledExecutorService reporter;

    public ConnectorPublishers(KafkaTemplate<String, String> template, OutboxStore outbox, PumpwatchKafkaProperties props,
                               MeterRegistry meters, HealthContributorRegistry health, Clock clock) {
        this.template = template;
        this.outbox = outbox;
        this.props = props;
        this.meters = meters;
        this.health = health;
        this.clock = clock;
    }

    public ConnectorPublisher create(String connectorName) {
        var p = new ConnectorPublisher(connectorName, outbox, template::send, props, meters, clock);
        health.registerContributor("connector-" + connectorName, (HealthIndicator) p::health);
        p.start();
        created.add(p);
        synchronized (this) {
            if (reporter == null) {
                reporter = Executors.newSingleThreadScheduledExecutor(
                        r -> Thread.ofPlatform().daemon().name("source-health").unstarted(r));
                reporter.scheduleWithFixedDelay(this::reportHealth, 0, 15, TimeUnit.SECONDS);
            }
        }
        return p;
    }

    void reportHealth() {
        for (var p : created) {
            try {
                template.send(Topics.SOURCE_HEALTH, p.name(), Json.toJson(p.sourceHealth()));
            } catch (RuntimeException e) {
                // the next report retries; a failing broker is already visible on the publisher's own health
            }
        }
    }

    @PreDestroy
    void shutdown() throws InterruptedException {
        if (reporter != null) reporter.shutdownNow();
        for (var p : created) p.close();
    }
}
