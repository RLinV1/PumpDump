package dev.pumpwatch.pipeline;

import dev.pumpwatch.pipeline.flagger.FlagConfig;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("pipeline")
public record PipelineProperties(
        @DefaultValue("GME,AMC,SNDL") List<String> watchlist,
        @DefaultValue("5") int scoringWindowMinutes,
        @DefaultValue("1.0") double baselineMentionsPerMinute,
        @DefaultValue("60") double flagLevel,
        @DefaultValue("PT30M") Duration cooldown,
        @DefaultValue("10") double reflagMargin,
        @DefaultValue("PT1H") Duration catalystLookback) {

    public FlagConfig flagConfig() {
        return new FlagConfig(scoringWindowMinutes, flagLevel, cooldown, reflagMargin, catalystLookback);
    }
}
