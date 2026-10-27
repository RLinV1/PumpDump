package dev.pumpwatch.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.pumpwatch.common.Flag.CatalystCheck;
import dev.pumpwatch.common.Flag.Contributor;
import dev.pumpwatch.common.Flag.Evidence;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CommonTest {
    static final Instant T = Instant.parse("2025-01-02T14:30:00Z");

    static PostRecord post() {
        return new PostRecord(1, T, T.plusSeconds(2), "reddit", "abc", "u1", null, "GME to the moon");
    }

    static TickRecord tick() {
        return new TickRecord(1, T, T, "GME", new BigDecimal("12.3400"), 100, null);
    }

    static ArticleRecord article() {
        return new ArticleRecord(1, T, T, "alpaca", "n1", "Press release: Foo", null, List.of(),
                Fingerprints.fingerprint("Press release: Foo"));
    }

    static FilingRecord filing() {
        return new FilingRecord(1, T, T, "0001-23-456", "123", null, "8-K", List.of("1.01"));
    }

    static Flag flag() {
        var ev = new Evidence(0.93, "rule-1", List.of(new Contributor("social", 0.4)), 120, 3400,
                new CatalystCheck(false, T.minusSeconds(3600), T, List.of()));
        return new Flag(1, T, T, "GME", T, ev);
    }

    @Test
    void jsonRoundTripsEveryRecordType() {
        Object[] all = {
            post(), tick(), article(), filing(),
            new DeadLetter("raw-posts", "bad", "{}", T, 1),
            new Features(1, T, T, "GME", T.minusSeconds(60), T, 1, Map.of("posts", 3.0), Set.of("social")),
            new Score(1, T, T, "GME", T, 0.5, "rule-1", Set.of("social")),
            flag()
        };
        for (Object o : all) {
            assertThat(Json.fromJson(Json.toJson(o), o.getClass())).isEqualTo(o);
        }
        assertThat(Json.toJson(tick())).contains("2025-01-02T14:30:00Z");
    }

    @Test
    void jsonIgnoresUnknownFields() {
        var json = Json.toJson(tick()).replace("{", "{\"extra\":1,");
        assertThat(Json.fromJson(json, TickRecord.class)).isEqualTo(tick());
    }

    @Test
    void validRecordsHaveNoProblems() {
        assertThat(Validator.validate(post())).isEmpty(); // null authorCreatedAt allowed
        assertThat(Validator.validate(tick())).isEmpty();
        assertThat(Validator.validate(article())).isEmpty(); // empty tickers allowed
        assertThat(Validator.validate(filing())).isEmpty();
        assertThat(Validator.validate(flag())).isEmpty();
        assertThat(Validator.validate(new DeadLetter("t", "r", null, T, 1))).isEmpty();
    }

    @Test
    void reportsEachFailureKind() {
        var bad = new TickRecord(2, T.plusSeconds(600), T, "bad1", BigDecimal.ZERO, 0, null);
        assertThat(Validator.validate(bad)).hasSize(5)
                .anyMatch(s -> s.contains("schemaVersion"))
                .anyMatch(s -> s.contains("5 minutes"))
                .anyMatch(s -> s.contains("ticker"))
                .anyMatch(s -> s.contains("price"))
                .anyMatch(s -> s.contains("size"));
        assertThat(Validator.validate(new TickRecord(1, null, null, null, null, 1, null)))
                .contains("eventTime is required", "ingestTime is required", "ticker is required");
        assertThat(Validator.validate(new PostRecord(1, T, T, " ", "p", "a", null, "")))
                .contains("source is required", "text is required");
    }

    @Test
    void tickerIsUpperCasedBeforeChecking() {
        assertThat(Validator.validate(new TickRecord(1, T, T, "brk.b", BigDecimal.ONE, 1, null))).isEmpty();
    }

    @Test
    void topicsForRun() {
        assertThat(Topics.forRun(Topics.TICKS, "run-42")).isEqualTo("replay.run-42.ticks");
        for (String bad : new String[] {null, "", " ", "a b", "a.b", "a/b"}) {
            assertThatThrownBy(() -> Topics.forRun(Topics.TICKS, bad)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(Topics.ALL).hasSize(8).contains("flags");
    }

    @Test
    void keys() {
        assertThat(Keys.postKey("reddit", "abc")).isEqualTo("reddit:abc");
        assertThat(Keys.tickerKey("gme")).isEqualTo("GME");
    }

    @Test
    void fingerprintsIgnoreCasePunctuationAndBoilerplate() {
        var base = Fingerprints.fingerprint("Acme Corp. announces merger");
        assertThat(Fingerprints.fingerprint("BREAKING: ACME Corp announces   merger!")).isEqualTo(base);
        assertThat(Fingerprints.fingerprint("Press Release: Acme Corp announces merger")).isEqualTo(base);
        assertThat(Fingerprints.fingerprint("Acme Corp announces layoffs")).isNotEqualTo(base);
        assertThat(base).hasSize(64);
    }
}
