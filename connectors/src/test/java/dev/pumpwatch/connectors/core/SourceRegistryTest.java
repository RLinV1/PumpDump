package dev.pumpwatch.connectors.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SourceRegistryTest {
    private static SourceRegistry registry(SourcesProperties.Source s) {
        return new SourceRegistry(new SourcesProperties(Map.of("sec", s)), Clock.systemUTC());
    }

    @Test
    void failsFastWhenRequiredUserAgentMissing() {
        assertThatThrownBy(() -> registry(new SourcesProperties.Source(300, " ", true, true)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sec")
                .hasMessageContaining("user-agent");
    }

    @Test
    void returnsUserAgentAndLimiter() {
        var r = registry(new SourcesProperties.Source(300, "pumpwatch me@example.com", true, true));
        assertThat(r.userAgent("sec")).isEqualTo("pumpwatch me@example.com");
        assertThat(r.rateLimiter("sec").tryAcquire()).isTrue();
        assertThatThrownBy(() -> r.rateLimiter("nope")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void optionalUserAgentMayBeAbsentAtStartup() {
        var r = registry(new SourcesProperties.Source(60, null, false, true));
        assertThatThrownBy(() -> r.userAgent("sec")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void disabledSourceWithoutUserAgentDoesNotFailStartup() {
        assertThat(registry(new SourcesProperties.Source(300, "", true, false))).isNotNull();
    }
}
