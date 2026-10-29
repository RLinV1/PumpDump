package dev.pumpwatch.replay;

import java.time.Instant;
import java.util.List;

public interface EventSource {
    /** Events in [from, to) strictly after (afterTime, afterId), ordered by (event_time, id). */
    List<RecordedEvent> page(Instant from, Instant to, Instant afterTime, long afterId, int limit);
}
