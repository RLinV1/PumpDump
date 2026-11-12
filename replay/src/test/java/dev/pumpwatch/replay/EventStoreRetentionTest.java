package dev.pumpwatch.replay;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class EventStoreRetentionTest {
    @Test
    void deletesRecordedEventsOlderThanThirtyDays() {
        var jdbc = mock(JdbcTemplate.class);
        new EventStore(jdbc).purgeOld();
        verify(jdbc).update(contains("DELETE FROM recorded_events"), eq(30));
    }

    @Test
    void aRetentionOfZeroKeepsEverything() {
        var jdbc = mock(JdbcTemplate.class);
        new EventStore(jdbc, 0).purgeOld();
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }

    @Test
    void retentionDaysIsConfigurable() {
        var jdbc = mock(JdbcTemplate.class);
        new EventStore(jdbc, 90).purgeOld();
        verify(jdbc).update(contains("DELETE FROM recorded_events"), eq(90));
    }
}
