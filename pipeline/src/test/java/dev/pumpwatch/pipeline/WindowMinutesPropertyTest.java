package dev.pumpwatch.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class WindowMinutesPropertyTest {
    private static List<Integer> bound(Map<String, String> props) {
        return new Binder(new MapConfigurationPropertySource(props)).bind("pipeline", PipelineProperties.class)
                .orElseGet(() -> null).windowMinutes();
    }

    @Test
    void onlyTheFiveMinuteWindowIsBuiltByDefault() {
        assertThat(bound(Map.of("pipeline.scorer", "rules"))).containsExactly(5);
    }

    @Test
    void windowsCanBeOverridden() {
        assertThat(bound(Map.of("pipeline.window-minutes", "1,5,30"))).containsExactly(1, 5, 30);
    }
}
