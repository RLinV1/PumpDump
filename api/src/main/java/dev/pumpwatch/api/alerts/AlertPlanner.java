package dev.pumpwatch.api.alerts;

import dev.pumpwatch.api.Views.FlagView;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Decides, for one channel, which pending flags go out alone, in a digest, or are dropped by the ticker cooldown. */
final class AlertPlanner {
    record Plan(List<FlagView> singles, List<FlagView> digest, List<FlagView> suppressed) {}

    private AlertPlanner() {}

    /**
     * @param pending oldest first
     * @param lastAlerted latest raisedAt already alerted per ticker on this channel
     * @param sentLastMinute single messages already created on this channel in the last minute
     */
    static Plan plan(List<FlagView> pending, Map<String, Instant> lastAlerted, int sentLastMinute, Duration cooldown,
                     int maxPerMinute) {
        var last = new HashMap<>(lastAlerted);
        var singles = new ArrayList<FlagView>();
        var digest = new ArrayList<FlagView>();
        var suppressed = new ArrayList<FlagView>();
        int room = Math.max(0, maxPerMinute - sentLastMinute);
        for (FlagView f : pending) {
            Instant prev = last.get(f.ticker());
            if (prev != null && f.raisedAt().isBefore(prev.plus(cooldown))) {
                suppressed.add(f);
                continue;
            }
            last.put(f.ticker(), f.raisedAt());
            if (singles.size() < room) singles.add(f);
            else digest.add(f);
        }
        return new Plan(singles, digest, suppressed);
    }
}
