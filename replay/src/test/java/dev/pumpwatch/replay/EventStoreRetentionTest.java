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
}
