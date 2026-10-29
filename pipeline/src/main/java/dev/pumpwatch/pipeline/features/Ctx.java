package dev.pumpwatch.pipeline.features;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Per-ticker context that outlives a window, kept in the "ctx" state store (changelog-backed): hourly mention and
 * volume buckets for the trailing seven-day baseline, and recent catalysts. Pruning is relative to the latest event
 * time seen, never the wall clock. Reads are always bounded by the asking window's own start and end, so records
 * that arrived after the window ended cannot change its features.
 */
public record Ctx(Map<Long, Bucket> hours, List<Cat> cats, long latestMs) {
    public static final Ctx EMPTY = new Ctx(Map.of(), List.of(), Long.MIN_VALUE);
    public static final long HOUR_MS = Duration.ofHours(1).toMillis();
    public static final int BASELINE_HOURS = 168;
    public static final Duration FILING_LOOKBACK = Duration.ofHours(24);
    public static final Duration NEWS_LOOKBACK = Duration.ofHours(6);
    /** Reported as minutesSinceCatalyst when no catalyst is inside the 24 hour lookback. */
    public static final double NO_CATALYST_MINUTES = 1440.0;

    public record Bucket(double mentions, double volume) {}

    /** Trailing baseline per minute; known is false until one full hour of history exists. */
    public record Baseline(boolean known, double mentionsPerMinute, double volumePerMinute) {}

    public Ctx {
        hours = hours == null ? Map.of() : hours;
        cats = cats == null ? List.of() : cats;
    }

    /** Folds one delta in: its mentions and volume into an hour bucket, its catalysts into the list. */
    public Ctx add(Agg d) {
        long latest = Math.max(latestMs, d.ms());
        Map<Long, Bucket> h = new TreeMap<>(hours);
        if (d.mentions() > 0 || d.volume() > 0) {
            h.merge(Math.floorDiv(d.ms(), HOUR_MS), new Bucket(d.mentions(), d.volume()),
                    (a, b) -> new Bucket(a.mentions() + b.mentions(), a.volume() + b.volume()));
        }
        long minHour = Math.floorDiv(latest, HOUR_MS) - BASELINE_HOURS - 2;
        h.keySet().removeIf(k -> k < minHour);
        List<Cat> c = new ArrayList<>(cats);
        c.addAll(d.cats());
        long minCat = latest - FILING_LOOKBACK.toMillis() - Duration.ofHours(1).toMillis();
        c.removeIf(x -> x.ms() < minCat);
        return new Ctx(h, c, latest);
    }

    /** Baseline over complete hour buckets that end at or before {@code startMs}, within the previous seven days. */
    public Baseline baseline(long startMs) {
        long lo = startMs - BASELINE_HOURS * HOUR_MS;
        double m = 0, v = 0;
        long earliest = Long.MAX_VALUE;
        for (Map.Entry<Long, Bucket> e : hours.entrySet()) {
            long bs = e.getKey() * HOUR_MS;
            if (bs < lo || bs + HOUR_MS > startMs) continue;
            m += e.getValue().mentions();
            v += e.getValue().volume();
            earliest = Math.min(earliest, bs);
        }
        if (earliest == Long.MAX_VALUE) return new Baseline(false, 0, 0);
        long span = Math.min(BASELINE_HOURS, Math.max(1, (startMs - earliest) / HOUR_MS));
        return new Baseline(true, m / (span * 60.0), v / (span * 60.0));
    }

    /** Catalyst feature values for the window [startMs, endMs]. Only catalysts at or before endMs are read. */
    public Map<String, Double> catalystFeatures(long startMs, long endMs) {
        Map<String, Double> out = new TreeMap<>();
        Set<String> outlets = new HashSet<>();
        double filings = 0;
        long latest = Long.MIN_VALUE;
        boolean preceded = false;
        for (Cat c : cats) {
            if (c.ms() > endMs || c.ms() <= endMs - FILING_LOOKBACK.toMillis()) continue;
            latest = Math.max(latest, c.ms());
            if (c.ms() <= startMs) preceded = true;
            if (Cat.FILING.equals(c.kind())) {
                filings++;
                for (String code : c.items()) out.merge("item." + code, 1.0, Double::sum);
            } else if (c.ms() > endMs - NEWS_LOOKBACK.toMillis()) {
                outlets.add(c.source());
            }
        }
        out.put("filings24h", filings);
        out.put("newsOutlets6h", (double) outlets.size());
        out.put("minutesSinceCatalyst", latest == Long.MIN_VALUE ? NO_CATALYST_MINUTES : (endMs - latest) / 60000.0);
        out.put("catalystPrecededMove", preceded ? 1.0 : 0.0);
        return out;
    }
}
