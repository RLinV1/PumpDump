package dev.pumpwatch.connectors.bluesky;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Account creation dates from the public AppView, behind a seam so tests can fake it. */
public interface ProfileClient {
    /** Up to 25 DIDs per call; DIDs the AppView does not know are absent from the result. */
    Map<String, Instant> createdAt(List<String> dids) throws Exception;
}
