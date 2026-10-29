package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.ApplicationContext;

@AutoConfigureObservability
@SpringBootTest(properties = {"pumpwatch.sources.sec.user-agent=pumpwatch test@example.com",
        "spring.kafka.bootstrap-servers=localhost:1",
        // no database in this test: the wiring under test does not use it
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration"})
class CoreWiringTest {
    @MockitoBean SeenItems seen;
    @MockitoBean ConnectorPositions positions;
    @MockitoBean OutboxStore outbox;
    @Autowired ConnectorPublishers publishers;
    @Autowired HealthEndpoint health;
    @Autowired SourceRegistry sources;
    @Autowired ApplicationContext ctx;

    @Test
    void connectorGetsItsOwnHealthContributorAndEndpointsAreExposed() {
        var p = publishers.create("wiring");
        assertThat(p.isAcceptingRecords()).isTrue();
        var component = health.healthForPath("connector-wiring");
        assertThat(component).isNotNull();
        assertThat(component.getStatus()).isEqualTo(Status.UP);
        assertThat(ctx.getBeanNamesForType(
                org.springframework.boot.actuate.metrics.export.prometheus.PrometheusScrapeEndpoint.class)).isNotEmpty();
        assertThat(sources.userAgent("sec")).startsWith("pumpwatch");
        assertThat(sources.rateLimiter("sec").tryAcquire()).isTrue();
    }
}
