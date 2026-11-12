package dev.pumpwatch.api;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ScoreRetentionTest {
    @Test
    void deletesOnlyLiveScoresOlderThanSevenDays() {
        var jdbc = mock(JdbcTemplate.class);
        new ReadRepository(jdbc).purgeOldLiveScores();
        verify(jdbc).update(contains("run_id = 'live'"), org.mockito.ArgumentMatchers.eq(7));
    }
}
