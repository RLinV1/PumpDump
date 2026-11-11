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
        return new PostRecord(2, T, T.plusSeconds(2), "reddit", "abc", "u1", null, List.of("GME"), 42L, null);
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
            new DeadLetter("raw-posts", "bad", "{}", T, T, 1),
            new Features(1, T, T, "GME", T.minusSeconds(60), T, 1, Map.of("posts", 3.0), Set.of("social")),
            new Score(SchemaVersions.SCORE, T, T, "GME", T, 0.5, "rule-1", Set.of("social"), null),
            new Score(SchemaVersions.SCORE, T, T, "GME", T, 0.5, "rule-1", Set.of(),
                    new Swing(2.5, 6.0, Swing.Regime.ELEVATED)),
            flag()
        };
        for (Object o : all) {
            assertThat(Json.fromJson(Json.toJson(o), o.getClass())).isEqualTo(o);
        }
        assertThat(Json.toJson(tick())).contains("2025-01-02T14:30:00Z");
    }

    @Test
    void jsonNullIsNotARecord() {
        assertThatThrownBy(() -> Json.fromJson("null", Score.class))
                .isInstanceOf(IllegalArgumentException.class);
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
        assertThat(Validator.validate(new DeadLetter("t", "r", null, T, T, 1))).isEmpty();
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
        assertThat(Validator.validate(new PostRecord(2, T, T, " ", "p", "a", null, List.of(), 0L, null)))
                .contains("source is required", "tickers is required");
    }

    @Test
    void deadLetterRequiresIngestTime() {
        assertThat(Validator.validate(new DeadLetter("t", "r", null, T, null, 1))).contains("ingestTime is required");
    }

    @Test
    void eventTimeMustMatchWindowEndOrRaisedAt() {
        var other = T.plusSeconds(1);
        var f = new Features(1, other, T, "GME", T.minusSeconds(60), T, 1, Map.of(), Set.of());
        assertThat(Validator.validate(f)).containsExactly("eventTime must equal windowEnd");
        assertThat(Validator.validate(new Score(SchemaVersions.SCORE, other, T, "GME", T, 0.5, "m", Set.of(), null)))
                .containsExactly("eventTime must equal windowEnd");
        var ev = flag().evidence();
        assertThat(Validator.validate(new Flag(1, other, T, "GME", T, ev)))
                .containsExactly("eventTime must equal raisedAt");
    }

    private static List<String> swingProblems(Swing s) {
        return Validator.validate(new Score(SchemaVersions.SCORE, T, T, "GME", T, 0.5, "m", Set.of(), s));
    }

    @Test
    void validatesSwing() {
        assertThat(SchemaVersions.SCORE).isEqualTo(2);
        assertThat(swingProblems(null)).isEmpty();
        assertThat(swingProblems(new Swing(2.0, 5.0, Swing.Regime.CALM))).isEmpty();
        assertThat(swingProblems(new Swing(3.0, 3.0, Swing.Regime.EXTREME))).isEmpty();
        assertThat(swingProblems(new Swing(5.0, 2.0, Swing.Regime.CALM)))
                .containsExactly("swing.upperBand must be >= swing.median");
        assertThat(swingProblems(new Swing(-1.0, 2.0, Swing.Regime.CALM)))
                .containsExactly("swing.median must be >= 0");
        assertThat(swingProblems(new Swing(Double.NaN, 2.0, Swing.Regime.CALM)))
                .contains("swing.median must be a finite number");
        assertThat(swingProblems(new Swing(1.0, Double.POSITIVE_INFINITY, Swing.Regime.CALM)))
                .containsExactly("swing.upperBand must be a finite number");
        assertThat(swingProblems(new Swing(1.0, 2.0, null))).containsExactly("swing.regime is required");
    }

    @Test
    void swingRegimeUsesSpecNamesInJson() {
        var json = Json.toJson(new Swing(1.0, 2.0, Swing.Regime.ELEVATED));
        assertThat(json).contains("\"regime\":\"elevated\"");
        assertThatThrownBy(() -> Json.fromJson(json.replace("elevated", "wild"), Swing.class))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsNonFiniteNumbers() {
        for (double bad : new double[] {Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            assertThat(Validator.validate(new Score(SchemaVersions.SCORE, T, T, "GME", T, bad, "m", Set.of(), null)))
                    .containsExactly("score must be a finite number");
            assertThat(Validator.validate(new Features(1, T, T, "GME", T.minusSeconds(60), T, 1,
                    Map.of("posts", bad), Set.of()))).containsExactly("values.posts must be a finite number");
            var ev = new Evidence(bad, "m", List.of(new Contributor("social", bad)), 1, 1,
                    new CatalystCheck(false, T, T, List.of()));
            assertThat(Validator.validate(new Flag(1, T, T, "GME", T, ev)))
                    .containsExactly("evidence.score must be a finite number",
                            "contributor social delta must be a finite number");
        }
    }

    @Test
    void tickerIsMatchedExactlyAsGiven() {
        assertThat(Validator.validate(new TickRecord(1, T, T, "gme", BigDecimal.ONE, 1, null))).isNotEmpty();
        assertThat(Validator.validate(new TickRecord(1, T, T, "GME", BigDecimal.ONE, 1, null))).isEmpty();
        assertThat(Validator.validate(new TickRecord(1, T, T, "BRK.B", BigDecimal.ONE, 1, null))).isEmpty();
    }

    @Test
    void topicsForRun() {
        assertThat(Topics.forRun(Topics.TICKS, "run-42")).isEqualTo("replay.run-42.ticks");
        for (String bad : new String[] {null, "", " ", "a b", "a.b", "a/b"}) {
            assertThatThrownBy(() -> Topics.forRun(Topics.TICKS, bad)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(Topics.ALL).hasSize(10).contains("flags", "mentions");
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
        assertThat(Fingerprints.fingerprint("Acme-Corp announces merger")).isEqualTo(base);
        assertThat(base).hasSize(64);
    }
}
