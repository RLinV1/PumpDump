package dev.pumpwatch.connectors.bluesky;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Settings under {@code pumpwatch.sources.bluesky.*} (see bluesky.yml). */
@ConfigurationProperties("pumpwatch.sources.bluesky")
public record BlueskyProperties(@DefaultValue("false") boolean enabled,
                                @DefaultValue("wss://jetstream2.us-east.bsky.network/subscribe") String url,
                                @DefaultValue List<String> financeTerms) {}
