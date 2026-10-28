package dev.pumpwatch.api;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

@Configuration
public class IngestConfig {
    /** Never gives up, so the offset of a record that could not be saved is never committed. */
    @Bean
    DefaultErrorHandler errorHandler() {
        var backOff = new ExponentialBackOff(1000, 2);
        backOff.setMaxInterval(60_000);
        backOff.setMaxElapsedTime(Long.MAX_VALUE);
        return new DefaultErrorHandler(backOff);
    }
}
