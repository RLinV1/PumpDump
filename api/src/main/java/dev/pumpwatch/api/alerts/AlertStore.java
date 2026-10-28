package dev.pumpwatch.api.alerts;

import dev.pumpwatch.api.Views.FlagView;
import java.time.Instant;
import java.util.List;
import java.util.Map;

interface AlertStore {
    record Due(long id, String channel, String payload, int attempts) {}

    /** Live-run flags newer than since that this channel has not decided yet, oldest first. */
    List<FlagView> pendingFlags(String channel, Instant since, int limit);

    Map<String, Instant> lastAlerted(String channel);

    int singlesSince(String channel, Instant since);

    /** Records the flag and queues one message, atomically. False if the flag was already decided on this channel. */
    boolean enqueueSingle(String channel, FlagView flag, String payload, Instant now);

    /** Records all flags and queues one digest. Flags already decided are skipped. */
    void enqueueDigest(String channel, List<FlagView> flags, String payload, Instant now);

    void suppress(String channel, List<FlagView> flags);

    List<Due> due(Instant now, int limit);

    void markSent(long id, Instant now);

    /** nextAttempt null means give up. */
    void markFailed(long id, String error, Instant nextAttempt);
}
