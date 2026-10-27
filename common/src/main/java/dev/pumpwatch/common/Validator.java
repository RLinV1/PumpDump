package dev.pumpwatch.common;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Business-rule checks. Returns human-readable problems; empty means valid. */
public final class Validator {
    private static final Pattern TICKER = Pattern.compile("^[A-Z.]{1,10}$");
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);

    private Validator() {}

    public static List<String> validate(PostRecord r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.POST);
        times(p, r.eventTime(), r.ingestTime());
        text(p, "source", r.source());
        text(p, "postId", r.postId());
        text(p, "authorId", r.authorId());
        text(p, "text", r.text());
        return p;
    }

    public static List<String> validate(TickRecord r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.TICK);
        times(p, r.eventTime(), r.ingestTime());
        ticker(p, r.ticker());
        if (r.price() == null || r.price().signum() <= 0) p.add("price must be > 0");
        if (r.size() <= 0) p.add("size must be > 0");
        return p;
    }

    public static List<String> validate(ArticleRecord r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.ARTICLE);
        times(p, r.eventTime(), r.ingestTime());
        text(p, "source", r.source());
        text(p, "itemId", r.itemId());
        text(p, "headline", r.headline());
        text(p, "fingerprint", r.fingerprint());
        r.tickers().forEach(t -> ticker(p, t));
        return p;
    }

    public static List<String> validate(FilingRecord r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.FILING);
        times(p, r.eventTime(), r.ingestTime());
        text(p, "accessionNumber", r.accessionNumber());
        text(p, "cik", r.cik());
        text(p, "form", r.form());
        if (r.ticker() != null) ticker(p, r.ticker());
        return p;
    }

    public static List<String> validate(Features r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.FEATURES);
        times(p, r.eventTime(), r.ingestTime());
        ticker(p, r.ticker());
        if (r.windowStart() == null || r.windowEnd() == null) p.add("windowStart and windowEnd are required");
        else if (!r.windowStart().isBefore(r.windowEnd())) p.add("windowStart must be before windowEnd");
        if (r.eventTime() != null && r.windowEnd() != null && !r.eventTime().equals(r.windowEnd()))
            p.add("eventTime must equal windowEnd");
        r.values().forEach((k, v) -> finite(p, "values." + k, v));
        if (r.windowMinutes() <= 0) p.add("windowMinutes must be > 0");
        return p;
    }

    public static List<String> validate(Score r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.SCORE);
        times(p, r.eventTime(), r.ingestTime());
        ticker(p, r.ticker());
        if (r.windowEnd() == null) p.add("windowEnd is required");
        else if (r.eventTime() != null && !r.eventTime().equals(r.windowEnd())) p.add("eventTime must equal windowEnd");
        finite(p, "score", r.score());
        text(p, "modelVersion", r.modelVersion());
        return p;
    }

    public static List<String> validate(Flag r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.FLAG);
        times(p, r.eventTime(), r.ingestTime());
        ticker(p, r.ticker());
        if (r.raisedAt() == null) p.add("raisedAt is required");
        else if (r.eventTime() != null && !r.eventTime().equals(r.raisedAt())) p.add("eventTime must equal raisedAt");
        var e = r.evidence();
        if (e == null) p.add("evidence is required");
        else {
            text(p, "evidence.modelVersion", e.modelVersion());
            finite(p, "evidence.score", e.score());
            e.topContributors().forEach(c -> finite(p, "contributor " + c.featureGroup() + " delta", c.delta()));
            if (e.catalyst() == null) p.add("evidence.catalyst is required");
            else if (e.catalyst().lookbackStart() == null || e.catalyst().lookbackEnd() == null)
                p.add("evidence.catalyst lookback window is required");
        }
        return p;
    }

    public static List<String> validate(DeadLetter r) {
        var p = new ArrayList<String>();
        version(p, r.schemaVersion(), SchemaVersions.DEAD_LETTER);
        text(p, "sourceTopic", r.sourceTopic());
        text(p, "reason", r.reason());
        if (r.failedAt() == null) p.add("failedAt is required");
        if (r.ingestTime() == null) p.add("ingestTime is required");
        return p;
    }

    private static void version(List<String> p, int actual, int expected) {
        if (actual != expected) p.add("schemaVersion must be " + expected + " but was " + actual);
    }

    private static void times(List<String> p, Instant event, Instant ingest) {
        if (event == null) p.add("eventTime is required");
        if (ingest == null) p.add("ingestTime is required");
        if (event != null && ingest != null && event.isAfter(ingest.plus(CLOCK_SKEW)))
            p.add("eventTime is more than 5 minutes after ingestTime");
    }

    private static void finite(List<String> p, String field, Double v) {
        if (v == null || !Double.isFinite(v)) p.add(field + " must be a finite number");
    }

    private static void text(List<String> p, String field, String v) {
        if (v == null || v.isBlank()) p.add(field + " is required");
    }

    private static void ticker(List<String> p, String t) {
        if (t == null || t.isBlank()) p.add("ticker is required");
        else if (!TICKER.matcher(t).matches()) p.add("ticker is invalid: " + t);
    }
}
