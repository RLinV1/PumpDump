package dev.pumpwatch.connectors.core;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class SeenItemsRetentionTest {
    @Test
    void deletesSeenItemsOlderThanSevenDays() {
        var jdbc = mock(JdbcTemplate.class);
        new SeenItems(jdbc).purgeOld();
        verify(jdbc).update(contains("DELETE FROM seen_items"), eq(7));
    }
}
