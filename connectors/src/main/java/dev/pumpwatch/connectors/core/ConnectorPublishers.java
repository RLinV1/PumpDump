package dev.pumpwatch.connectors.core;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.kafka.core.KafkaTemplate;

/** Creates one started publisher per connector name and registers its health contributor. */
public class ConnectorPublishers {
    private final KafkaTemplate<String, String> template;
    private final PumpwatchKafkaProperties props;
    private final MeterRegistry meters;
    private final HealthContributorRegistry health;
    private final Clock clock;
    private final List<ConnectorPublisher> created = new CopyOnWriteArrayList<>();

    public ConnectorPublishers(KafkaTemplate<String, String> template, PumpwatchKafkaProperties props,
                               MeterRegistry meters, HealthContributorRegistry health, Clock clock) {
        this.template = template;
        this.props = props;
        this.meters = meters;
        this.health = health;
        this.clock = clock;
    }

    public ConnectorPublisher create(String connectorName) {
        var p = new ConnectorPublisher(connectorName, template::send, props, meters, clock);
        health.registerContributor("connector-" + connectorName, (HealthIndicator) p::health);
        p.start();
        created.add(p);
        return p;
    }

    @PreDestroy
    void shutdown() throws InterruptedException {
        for (var p : created) p.close();
    }
}
