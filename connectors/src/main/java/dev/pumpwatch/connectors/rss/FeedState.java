package dev.pumpwatch.connectors.rss;

/** Validators from a feed's last 200 response. */
record FeedState(String etag, String lastModified) {}
