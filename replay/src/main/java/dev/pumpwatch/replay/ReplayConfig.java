package dev.pumpwatch.replay;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

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
}
