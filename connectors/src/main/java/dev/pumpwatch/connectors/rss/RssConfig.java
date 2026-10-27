package dev.pumpwatch.connectors.rss;

import dev.pumpwatch.connectors.core.SourceRegistry;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Registers the source only when {@code pumpwatch.sources.rss.enabled=true}; the scheduler runs it. */
@Configuration
@ConditionalOnProperty(name = "pumpwatch.sources.rss.enabled", havingValue = "true")
class RssConfig {
    @Bean
    RssSource rssSource(@Value("${pumpwatch.sources.rss.feeds:}") List<String> feeds,
                        @Value("${pumpwatch.sources.rss.poll-interval:60s}") Duration pollInterval,
                        SourceRegistry registry, JdbcTemplate jdbc, Clock clock) {
        var client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build();
        return new RssSource(feeds.stream().map(String::trim).filter(f -> !f.isEmpty()).toList(), pollInterval,
                FeedHttp.jdk(client), new JdbcFeedStateStore(jdbc), registry.rateLimiter(RssSource.NAME), clock);
    }
}
