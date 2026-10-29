package dev.pumpwatch.api.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AlertPlannerTest {
    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void cooldownSuppressesSameTickerUntilItExpires() {
        var pending = List.of(AlertServiceTest.flag(1, "GME", T.plusSeconds(60), 80),
                AlertServiceTest.flag(2, "GME", T.plus(Duration.ofMinutes(31)), 80));
        var plan = AlertPlanner.plan(pending, Map.of("GME", T), 0, Duration.ofMinutes(30), 5);
        assertThat(plan.suppressed()).extracting(f -> f.id()).containsExactly(1L);
        assertThat(plan.singles()).extracting(f -> f.id()).containsExactly(2L);
    }

    @Test
    void flagsBeyondRateGoToDigestAndRecentSendsCount() {
        var pending = List.of(AlertServiceTest.flag(1, "A", T, 70), AlertServiceTest.flag(2, "B", T, 70),
                AlertServiceTest.flag(3, "C", T, 70));
        var plan = AlertPlanner.plan(pending, Map.of(), 1, Duration.ofMinutes(30), 2);
        assertThat(plan.singles()).hasSize(1);
        assertThat(plan.digest()).hasSize(2);
    }
}
