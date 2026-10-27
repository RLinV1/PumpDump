package dev.pumpwatch.replay;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.util.backoff.BackOffExecution;

class ReplayConfigTest {
    @Test
    void errorHandlerNeverGivesUp() {
        var exec = ReplayConfig.backOff().start();
        for (int i = 0; i < 1000; i++) {
            assertThat(exec.nextBackOff()).isNotEqualTo(BackOffExecution.STOP);
        }
    }
}
