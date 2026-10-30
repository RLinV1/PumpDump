package dev.pumpwatch.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.Topology;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.kafka.config.StreamsBuilderFactoryBean;

class PipelineApplicationTest {
    @Test
    void springCreatesTheCompleteTopologyWithProductionKafkaSettings() {
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(PipelineApplication.class)
                .withPropertyValues("spring.kafka.bootstrap-servers=localhost:9092",
                        "spring.kafka.streams.application-id=pipeline-startup-test",
                        "spring.kafka.streams.auto-startup=false")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    String topology = context.getBean(Topology.class).describe().toString();
                    assertThat(topology).contains("raw-posts", "ticks", "features", "scores", "flags");
                    var factory = context.getBean("&defaultKafkaStreamsBuilder", StreamsBuilderFactoryBean.class);
                    var config = new StreamsConfig(factory.getStreamsConfiguration());
                    assertThatCode(() -> config.getProducerConfigs("pipeline-startup-test"))
                            .doesNotThrowAnyException();
                });
    }
}
