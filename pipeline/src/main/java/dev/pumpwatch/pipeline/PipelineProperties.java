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
        @DefaultValue("PT1H") Duration catalystLookback,
        @DefaultValue("rules") String scorer,
        @DefaultValue("PT5M") Duration staleAfter,
        /** Directory holding model.onnx, model.json and reference.json; empty means no model, so the rule scorer. */
        @DefaultValue("") String modelDir,
        /** Directory of a vol-train model (median.onnx, upper.onnx, model.json, reference.json); empty means the HAR-RV baseline. */
        @DefaultValue("") String volModelDir,
        /** Feature windows to build. Only scoring-window-minutes is read downstream; each extra window costs state and CPU. */
        @DefaultValue("5") List<Integer> windowMinutes) {

    public FlagConfig flagConfig() {
        return new FlagConfig(scoringWindowMinutes, flagLevel, cooldown, reflagMargin, catalystLookback);
    }
}
