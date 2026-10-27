package dev.pumpwatch.connectors.sec;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

final class JdbcTickerStore implements TickerStore {
    private final JdbcTemplate jdbc;

    JdbcTickerStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> ticker(String cik) {
        return jdbc.queryForList("SELECT ticker FROM sec_company_tickers WHERE cik = ?", String.class, cik)
                .stream().findFirst();
    }

    @Override
    public void saveAll(List<Entry> entries) {
        jdbc.batchUpdate("""
                INSERT INTO sec_company_tickers (cik, ticker, title, updated_at) VALUES (?, ?, ?, now())
                ON CONFLICT (cik) DO UPDATE SET ticker = excluded.ticker, title = excluded.title, updated_at = now()
                """, entries, 1000, (ps, e) -> {
            ps.setString(1, e.cik());
            ps.setString(2, e.ticker());
            ps.setString(3, e.title());
        });
    }
}
