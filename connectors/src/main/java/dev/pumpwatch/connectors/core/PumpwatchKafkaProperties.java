package dev.pumpwatch.connectors.core;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Producer and publisher settings under {@code pumpwatch.kafka.*}.
 *
 * @param retries            producer retries, bounded so a stuck send fails rather than hanging
 * @param deliveryTimeout    upper bound on one send including retries (delivery.timeout.ms)
 * @param maxBlock           how long send() may block on metadata (max.block.ms), keeps the sender loop responsive
 * @param maxInFlight        max.in.flight.requests.per.connection, must be at most 5 for idempotence
 * @param bufferCapacity     records held per connector while the broker is slow or down
 * @param batchSize          records sent per sender-loop pass before waiting for acks
 * @param initialBackoff     first wait after a failed send
 * @param maxBackoff         cap for the exponential wait between retries
 * @param brokerDownAfter    health goes DOWN once sends have failed continuously this long
 * @param maxFetchAge        health goes DOWN when the last successful fetch is older than this
 */
@ConfigurationProperties("pumpwatch.kafka")
public record PumpwatchKafkaProperties(
        @DefaultValue("10") int retries,
        @DefaultValue("2m") Duration deliveryTimeout,
        @DefaultValue("10s") Duration maxBlock,
        @DefaultValue("5") int maxInFlight,
        @DefaultValue("10000") int bufferCapacity,
        @DefaultValue("500") int batchSize,
        @DefaultValue("100ms") Duration initialBackoff,
        @DefaultValue("10s") Duration maxBackoff,
        @DefaultValue("60s") Duration brokerDownAfter,
        @DefaultValue("2m") Duration maxFetchAge) {

    public PumpwatchKafkaProperties {
        if (maxInFlight < 1 || maxInFlight > 5)
            throw new IllegalArgumentException("pumpwatch.kafka.max-in-flight must be 1..5 to keep ordering with idempotence");
        if (bufferCapacity < 1 || batchSize < 1) throw new IllegalArgumentException("buffer-capacity and batch-size must be >= 1");
    }

    public static PumpwatchKafkaProperties defaults() {
        return new PumpwatchKafkaProperties(10, Duration.ofMinutes(2), Duration.ofSeconds(10), 5, 10_000, 500,
                Duration.ofMillis(100), Duration.ofSeconds(10), Duration.ofSeconds(60), Duration.ofMinutes(2));
    }
}
