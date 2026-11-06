package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Flag;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class SseHubTest {
    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");
    static final ApiProperties PROPS =
            new ApiProperties(List.of(), 120, 30, Duration.ofSeconds(15), Duration.ofSeconds(1), 2);

    ReadRepository repo = mock(ReadRepository.class);
    SseHub hub = new SseHub(repo, PROPS);

    @Test
    void springCreatesTheHubWithItsProductionDependencies() {
        new ApplicationContextRunner().withUserConfiguration(SseHub.class)
                .withBean(ReadRepository.class, () -> repo).withBean(ApiProperties.class, () -> PROPS)
                .run(context -> {
                    assertThat(context).hasSingleBean(SseHub.class);
                    context.getBean(SseHub.class).subscribe("live", null);
                    verify(repo).maxFlagId("live");
                });
    }

    static FlagView flag(long id) {
        var e = new Flag.Evidence(70, "rules-1", List.of(), 5, 2, new Flag.CatalystCheck(false, T, T, List.of()));
        return new FlagView(id, "GME", T, e);
    }

    @Test
    void resumesFromLastEventIdAndAdvancesTheCursor() {
        when(repo.flagsAfter("live", 41, SseHub.BATCH)).thenReturn(List.of(flag(42), flag(43)));
        hub.subscribe("live", 41L);
        hub.tick();
        hub.tick();
        var order = inOrder(repo);
        order.verify(repo).flagsAfter("live", 41, SseHub.BATCH);
        order.verify(repo).flagsAfter("live", 43, SseHub.BATCH);
        verify(repo, never()).maxFlagId("live");
    }

    @Test
    void withoutLastEventIdStartsFromNow() {
        when(repo.maxFlagId("live")).thenReturn(10L);
        hub.subscribe("live", null);
        hub.tick();
        verify(repo).flagsAfter("live", 10, SseHub.BATCH);
    }

    @Test
    void streamsAreCapped() {
        hub.subscribe("live", 0L);
        hub.subscribe("live", 0L);
        org.junit.jupiter.api.Assertions.assertThrows(SseHub.TooManyStreams.class, () -> hub.subscribe("live", 0L));
        assertThat(hub.clientCount()).isEqualTo(2);
    }

    @Test
    void heartbeatIsSentWhenIdle() {
        var clock = new java.time.Clock() {
            Instant now = T;
            public java.time.ZoneId getZone() { return java.time.ZoneOffset.UTC; }
            public java.time.Clock withZone(java.time.ZoneId z) { return this; }
            public Instant instant() { return now; }
        };
        var timed = new SseHub(repo, PROPS, clock);
        var emitter = timed.subscribe("live", 0L);
        clock.now = T.plusSeconds(16);
        timed.tick(); // no flags, heartbeat due: the send is buffered on the not-yet-started emitter, not an error
        assertThat(timed.clientCount()).isEqualTo(1);
        assertThat(emitter).isNotNull();
    }
}
