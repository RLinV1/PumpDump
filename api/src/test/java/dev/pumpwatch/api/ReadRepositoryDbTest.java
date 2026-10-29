package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;

import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.SchemaVersions;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ReadRepository.class)
class ReadRepositoryDbTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
        r.add("spring.flyway.table", () -> "flyway_history_api");
    }

    @Autowired ReadRepository repo;

    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");

    static Flag flag(String ticker, Instant at, double score) {
        var e = new Flag.Evidence(score, "rules-1", List.of(new Flag.Contributor("chatter", 20)), 5, 2,
                new Flag.CatalystCheck(false, at.minusSeconds(3600), at, List.of()));
        return new Flag(SchemaVersions.FLAG, at, at, ticker, at, e);
    }

    static Score score(String ticker, Instant at, double score) {
        return new Score(SchemaVersions.SCORE, at, at, ticker, at, score, "rules-1", Set.of("news"));
    }

    @Test
    void replayedFlagsNeverAppearInLiveReads() {
        repo.saveFlag("live", "flags", 0, 1, flag("GME", T, 70));
        repo.saveFlag("run-1", "replay.run-1.flags", 0, 1, flag("GME", T.plusSeconds(60), 99));
        repo.saveFlag("run-1", "flags", 0, 2, flag("AMC", T.plusSeconds(120), 98)); // replay header on a live topic

        var live = repo.recentFlags("live", 50);
        assertThat(live).hasSize(1);
        assertThat(live.get(0).evidence().score()).isEqualTo(70);
        assertThat(repo.flagsAfter("live", 0, 50)).hasSize(1);
        assertThat(repo.flags("live", "GME", T.minusSeconds(1), T.plusSeconds(600))).hasSize(1);
        assertThat(repo.recentFlags("run-1", 50)).hasSize(2);
    }

    @Test
    void writesAreIdempotentPerOffset() {
        repo.saveFlag("live", "flags", 1, 5, flag("TSLA", T, 61));
        repo.saveFlag("live", "flags", 1, 5, flag("TSLA", T, 61));
        repo.saveScore("live", "scores", 1, 5, score("TSLA", T, 10));
        repo.saveScore("live", "scores", 1, 5, score("TSLA", T, 10));
        assertThat(repo.recentFlags("live", 50).stream().filter(f -> f.ticker().equals("TSLA"))).hasSize(1);
        assertThat(repo.scores("live", "TSLA", T.minusSeconds(1), T.plusSeconds(1))).hasSize(1);
    }

    @Test
    void watchlistIsLatestLiveScorePerTickerAndTimelineIsEventTimeOrdered() {
        repo.saveScore("live", "scores", 0, 10, score("NVDA", T.plusSeconds(300), 30));
        repo.saveScore("live", "scores", 0, 11, score("NVDA", T, 10)); // arrives late, older window
        repo.saveScore("run-2", "replay.run-2.scores", 0, 1, score("NVDA", T.plusSeconds(900), 90));

        var latest = repo.latestScores("live").stream().filter(s -> s.ticker().equals("NVDA")).toList();
        assertThat(latest).hasSize(1);
        assertThat(latest.get(0).score()).isEqualTo(30);
        assertThat(latest.get(0).staleSources()).containsExactly("news");

        var series = repo.scores("live", "NVDA", T.minusSeconds(1), T.plusSeconds(1000));
        assertThat(series).extracting(s -> s.score()).containsExactly(10.0, 30.0);
    }

    @Test
    void storedFlagJsonHasNoRawContentFields() {
        repo.saveFlag("live", "flags", 2, 1, flag("IBM", T, 65));
        String json = Json.toJson(repo.recentFlags("live", 50).stream()
                .filter(f -> f.ticker().equals("IBM")).toList()).toLowerCase();
        assertThat(json).doesNotContain("author").doesNotContain("\"text\"");
    }
}
