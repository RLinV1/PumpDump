package dev.pumpwatch.pipeline.flagger;

import java.time.Duration;

/**
 * @param windowMinutes feature window length the flagger pairs with each score
 * @param level score at or above which a flag is considered
 * @param cooldown event-time gap before the same ticker can be flagged again
 * @param reflagMargin inside the cooldown, a re-flag needs the score to beat the last flagged score by this much
 * @param catalystLookback length of the catalyst check window that ends at the flag time
 */
public record FlagConfig(int windowMinutes, double level, Duration cooldown, double reflagMargin,
                         Duration catalystLookback) {}
