package dev.pumpwatch.connectors.core;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Runs every enabled {@link NewsSource} bean. SeenItems (Postgres) is only required once a source exists. */
@Configuration
class NewsSchedulerConfig {
    @Bean(initMethod = "start", destroyMethod = "stop")
    NewsScheduler newsScheduler(ObjectProvider<NewsSource> sources, ConnectorPublishers publishers,
                                ObjectProvider<SeenItems> seen) {
        var list = sources.orderedStream().toList();
        return new NewsScheduler(list, publishers::create, list.isEmpty() ? null : seen.getObject());
    }
}
