package dev.pumpwatch.connectors.core;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** One daemon thread per {@link NewsSource}; an exception in one source is logged and retried, never shared. */
public final class NewsScheduler {
    private static final Logger log = LoggerFactory.getLogger(NewsScheduler.class);

    private final List<NewsSource> sources;
    private final Function<String, ConnectorPublisher> publishers;
    private final SeenItems seen;
    private final List<Thread> threads = new ArrayList<>();
    private volatile boolean stopped;

    public NewsScheduler(List<NewsSource> sources, Function<String, ConnectorPublisher> publishers, SeenItems seen) {
        this.sources = List.copyOf(sources);
        this.publishers = publishers;
        this.seen = seen;
    }

    public synchronized void start() {
        if (!threads.isEmpty()) return;
        for (var s : sources) {
            var sink = new NewsSink(publishers.apply(s.name()), seen::isSeen, seen::markNew, () -> stopped);
            threads.add(Thread.ofPlatform().daemon().name("news-" + s.name()).start(() -> loop(s, sink)));
        }
    }

    public synchronized void stop() {
        stopped = true;
        sources.forEach(NewsSource::stop);
        threads.forEach(Thread::interrupt);
    }

    static Duration backoff(int attempt) {
        return Duration.ofSeconds(Math.min(60, 1L << Math.min(attempt, 6)));
    }

    private void loop(NewsSource s, NewsSink sink) {
        int failures = 0;
        while (!stopped) {
            boolean failed = false;
            try {
                s.run(sink);
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                failed = true;
                log.warn("[{}] failed: {}", s.name(), e.toString());
            }
            failures = failed ? failures + 1 : 0;
            if (stopped) return;
            Duration wait = s.streaming() ? backoff(Math.max(0, failures - 1)) : s.interval();
            try {
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                return;
            }
        }
    }
}
