package dev.pumpwatch.api;

import java.util.regex.Pattern;

/** Which run a record belongs to: "live", or the replay run id. Live endpoints only ever read "live". */
public final class RunIds {
    public static final String LIVE = "live";
    public static final Pattern VALID = Pattern.compile("[A-Za-z0-9-]{1,64}");
    private static final Pattern REPLAY_TOPIC = Pattern.compile("^replay\\.([A-Za-z0-9-]+)\\.(?:scores|flags)$");

    private RunIds() {}

    /** The pw-run-id header (set on any replayed record, even on live topics) wins over the topic name. */
    public static String of(String topic, String headerRunId) {
        if (headerRunId != null && !headerRunId.isBlank()) return headerRunId;
        var m = REPLAY_TOPIC.matcher(topic);
        return m.matches() ? m.group(1) : LIVE;
    }
}
