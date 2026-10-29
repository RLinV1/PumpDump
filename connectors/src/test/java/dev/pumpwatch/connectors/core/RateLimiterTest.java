package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class RateLimiterTest {
    private final FakeClock clock = new FakeClock();

    @Test
    void refillsAtConfiguredRateUpToCapacity() {
        var rl = new RateLimiter(120, clock); // 2/s, capacity 2
        assertThat(rl.tryAcquire()).isTrue();
        assertThat(rl.tryAcquire()).isTrue();
        assertThat(rl.tryAcquire()).isFalse();
        clock.advance(Duration.ofMillis(500));
        assertThat(rl.tryAcquire()).isTrue();
        assertThat(rl.tryAcquire()).isFalse();
        clock.advance(Duration.ofHours(1));
        assertThat(rl.tryAcquire()).isTrue();
        assertThat(rl.tryAcquire()).isTrue();
        assertThat(rl.tryAcquire()).isFalse(); // capped, no unbounded burst
    }

    @Test
    void retryAfterPausesTheBucket() {
        var rl = new RateLimiter(60, clock); // 1/s, capacity 1
        rl.pauseUntil(clock.instant().plusSeconds(10));
        clock.advance(Duration.ofSeconds(9));
        assertThat(rl.tryAcquire()).isFalse();
        clock.advance(Duration.ofSeconds(1));
        assertThat(rl.tryAcquire()).isFalse(); // resumes empty
        clock.advance(Duration.ofSeconds(1));
        assertThat(rl.tryAcquire()).isTrue();
    }

    @Test
    void blockingAcquireWaitsForToken() {
        var rl = new RateLimiter(600, Clock.systemUTC()); // 10/s, capacity 10
        for (int i = 0; i < 10; i++) assertThat(rl.tryAcquire()).isTrue();
        long t0 = System.nanoTime();
        rl.acquire();
        assertThat(Duration.ofNanos(System.nanoTime() - t0)).isBetween(Duration.ofMillis(50), Duration.ofSeconds(2));
    }
}
