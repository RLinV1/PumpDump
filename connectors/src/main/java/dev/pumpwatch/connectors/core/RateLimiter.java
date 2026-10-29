package dev.pumpwatch.connectors.core;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Token bucket. Refills at requestsPerMinute/60 per second; capacity is one second's worth (at least 1), so
 * bursts stay small and the rate over any minute cannot exceed the configured limit by much.
 */
public final class RateLimiter {
    private final Clock clock;
    private final double perNano;
    private final double capacity;
    private double tokens;
    private Instant last;
    private Instant pausedUntil;

    public RateLimiter(int requestsPerMinute, Clock clock) {
        if (requestsPerMinute < 1) throw new IllegalArgumentException("requestsPerMinute must be >= 1");
        this.clock = clock;
        this.perNano = requestsPerMinute / 60.0 / 1e9;
        this.capacity = Math.max(1, requestsPerMinute / 60);
        this.tokens = capacity;
        this.last = clock.instant();
        this.pausedUntil = Instant.MIN;
    }

    public synchronized boolean tryAcquire() {
        return waitNanos() == 0;
    }

    /** Blocks until a token is available. */
    public void acquire() {
        long wait;
        while ((wait = nextWait()) > 0) {
            try {
                Thread.sleep(Duration.ofNanos(wait));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted while waiting for rate limit", e);
            }
        }
    }

    /** Honor a server "retry after": no tokens until the instant, then the bucket restarts empty. */
    public synchronized void pauseUntil(Instant until) {
        if (until.isAfter(pausedUntil)) pausedUntil = until;
        tokens = 0;
    }

    private synchronized long nextWait() {
        return waitNanos();
    }

    /** Takes a token and returns 0, or returns nanoseconds to wait without taking one. */
    private long waitNanos() {
        Instant now = clock.instant();
        if (now.isBefore(pausedUntil)) return Duration.between(now, pausedUntil).toNanos();
        Instant from = last.isAfter(pausedUntil) ? last : pausedUntil;
        if (now.isAfter(from)) tokens = Math.min(capacity, tokens + Duration.between(from, now).toNanos() * perNano);
        last = now;
        if (tokens >= 1) {
            tokens -= 1;
            return 0;
        }
        return Math.max(1, (long) Math.ceil((1 - tokens) / perNano));
    }
}
