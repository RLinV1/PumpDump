package dev.pumpwatch.connectors.rss;

import java.util.Optional;

/** Durable per-feed ETag / Last-Modified. */
interface FeedStateStore {
    Optional<FeedState> get(String feedUrl);

    void save(String feedUrl, FeedState state);
}
