package dev.pumpwatch.replay;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

@Configuration
public class ReplayConfig {
    @Bean
    Executor replayExecutor() {
        return Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "replay");
            t.setDaemon(true);
            return t;
        });
    }

    @Bean
    Replayer.Sleeper sleeper() {
        return Thread::sleep;
    }

    @Bean
    Replayer.Sink sink(KafkaTemplate<String, String> kafka) {
        return r -> kafka.send(r).get(); // wait per record so publish order is exactly event-time order
    }

    static ExponentialBackOff backOff() {
        var backOff = new ExponentialBackOff(1000, 2);
        backOff.setMaxInterval(60_000);
        backOff.setMaxElapsedTime(Long.MAX_VALUE);
        return backOff;
    }

    /** Boot applies this to the default listener container factory. Never gives up, so offsets of unsaved records are never committed. */
    @Bean
    DefaultErrorHandler errorHandler() {
        return new DefaultErrorHandler(backOff());
    }
}
