package dev.pumpwatch.pipeline;

import dev.pumpwatch.common.Keys;
import dev.pumpwatch.pipeline.extractor.MentionExtractor;
import dev.pumpwatch.pipeline.features.FeatureStage;
import dev.pumpwatch.pipeline.flagger.FlagStage;
import dev.pumpwatch.pipeline.scorer.RuleScorer;
import dev.pumpwatch.pipeline.scorer.Scorer;
import dev.pumpwatch.pipeline.scorer.ScorerStage;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.kafka.streams.StreamsBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.annotation.EnableKafkaStreams;
import org.springframework.kafka.config.StreamsBuilderFactoryBeanConfigurer;
import org.springframework.kafka.streams.KafkaStreamsMicrometerListener;

/**
 * Four stages (extractor, features, scorer, flagger) in one Kafka Streams app. They share no objects at runtime: each
 * reads and writes Kafka topics, so a stage can later move into its own service unchanged.
 */
@SpringBootApplication
@EnableKafkaStreams
@EnableConfigurationProperties(PipelineProperties.class)
public class PipelineApplication {
    public static void main(String[] args) {
        SpringApplication.run(PipelineApplication.class, args);
    }

    @Bean
    Scorer scorer() {
        return new RuleScorer();
    }

    @Autowired
    void topology(StreamsBuilder builder, PipelineProperties p, Scorer scorer) {
        build(builder, p, scorer);
    }

    /** Exposes Kafka Streams metrics, including dropped-records (late data beyond grace), to Micrometer. */
    @Bean
    StreamsBuilderFactoryBeanConfigurer metrics(MeterRegistry registry) {
        return fb -> fb.addListener(new KafkaStreamsMicrometerListener(registry));
    }

    public static void build(StreamsBuilder b, PipelineProperties p, Scorer scorer) {
        build(b, p, scorer, FeatureStage.WINDOW_MINUTES);
    }

    public static void build(StreamsBuilder b, PipelineProperties p, Scorer scorer, List<Integer> windowMinutes) {
        Set<String> watchlist = p.watchlist().stream().map(Keys::tickerKey).collect(Collectors.toSet());
        MentionExtractor.build(b, watchlist);
        FeatureStage.build(b, p.baselineMentionsPerMinute(), windowMinutes, watchlist);
        ScorerStage.build(b, scorer, p.scoringWindowMinutes());
        FlagStage.build(b, scorer, p.flagConfig());
    }
}
