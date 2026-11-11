package dev.pumpwatch.pipeline.features;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * One ticker's recent one-minute bars and trading days, built from closed 15 second panes. Feeds the volatility model
 * the same six inputs as {@code ml/pumpml/vol.py build()}: rv5, rv30, rvd (square roots of the summed squared one-bar
 * log-close returns over the last 5, 30 and 390 bars), vol_ratio (mean volume of the last 30 bars over the last 390),
 * tod (start minute of the latest bar, New York time) and gap (log of the day's first open over the previous day's last
 * close, 0 on the first day). Like vol.py, the windows count bars, not clock minutes: a minute with no trade has no bar.
 * shortcut: a bar's open is the last trade of its first traded second (panes keep one price per second), and a pane
 * for an earlier minute than the newest bar is dropped; take exact first trades from the tick stream if that matters.
 */
public record Bars(List<Bar> bars, List<Day> days) {
    public static final Bars EMPTY = new Bars(List.of(), List.of());
    public static final int DAY = 390, SHORT = 5, LONG = 30, KEEP = DAY + 1 + 30; // 30 spare bars for as-of lookups
    static final ZoneId EXCHANGE = ZoneId.of("America/New_York");

    /** @param min epoch minute of the bar start */
    public record Bar(long min, double open, double close, double volume) {}

    public record Day(String date, double open, double close) {}

    public Bars {
        bars = bars == null ? List.of() : bars;
        days = days == null ? List.of() : days;
    }

    /** Folds a closed pane into the bars; panes without trades, or older than the newest bar, change nothing. */
    public Bars add(Agg pane) {
        if (pane.secs().isEmpty()) return this;
        TreeMap<Long, Agg.Pt> s = new TreeMap<>(pane.secs());
        long min = Math.floorDiv(s.firstKey(), 60L);
        double open = s.firstEntry().getValue().price(), close = s.lastEntry().getValue().price();
        List<Bar> b = new ArrayList<>(bars);
        Bar last = b.isEmpty() ? null : b.get(b.size() - 1);
        if (last != null && last.min() > min) return this;
        if (last != null && last.min() == min) {
            b.set(b.size() - 1, new Bar(min, last.open(), close, last.volume() + pane.volume()));
        } else {
            b.add(new Bar(min, open, close, pane.volume()));
        }
        String date = date(min);
        List<Day> d = new ArrayList<>(days);
        Day ld = d.isEmpty() ? null : d.get(d.size() - 1);
        if (ld != null && ld.date().equals(date)) d.set(d.size() - 1, new Day(date, ld.open(), close));
        else d.add(new Day(date, open, close));
        return new Bars(new ArrayList<>(b.subList(Math.max(0, b.size() - KEEP), b.size())),
                new ArrayList<>(d.subList(Math.max(0, d.size() - 4), d.size())));
    }

    /** Model features from the bars complete by {@code end}; a feature is absent until its window is full. */
    public Map<String, Double> features(Instant end) {
        long endSec = end.getEpochSecond();
        int n = 0;
        while (n < bars.size() && (bars.get(n).min() + 1) * 60 <= endSec) n++;
        Map<String, Double> out = new HashMap<>();
        if (n == 0) return out;
        List<Bar> b = bars.subList(Math.max(0, n - DAY - 1), n);
        Bar last = b.get(b.size() - 1);
        var start = Instant.ofEpochSecond(last.min() * 60).atZone(EXCHANGE);
        out.put("tod", (double) (start.getHour() * 60 + start.getMinute()));
        out.put("gap", gap(date(last.min())));
        double[] r2 = new double[b.size()];
        for (int i = 1; i < r2.length; i++) {
            double r = Math.log(b.get(i).close()) - Math.log(b.get(i - 1).close());
            r2[i] = r * r;
        }
        if (b.size() > SHORT) out.put("rv5", Math.sqrt(sum(r2, SHORT)));
        if (b.size() > LONG) out.put("rv30", Math.sqrt(sum(r2, LONG)));
        if (b.size() > DAY) {
            out.put("rvd", Math.sqrt(sum(r2, DAY)));
            double[] v = b.stream().mapToDouble(Bar::volume).toArray();
            double daily = mean(v, v.length - DAY, v.length);
            if (daily > 0) out.put("vol_ratio", mean(v, v.length - LONG, v.length) / daily);
        }
        return out;
    }

    private double gap(String date) {
        for (int i = 1; i < days.size(); i++) {
            if (days.get(i).date().equals(date)) return Math.log(days.get(i).open() / days.get(i - 1).close());
        }
        return 0.0;
    }

    private static double sum(double[] a, int k) {
        double s = 0;
        for (int i = a.length - k; i < a.length; i++) s += a[i];
        return s;
    }

    private static double mean(double[] a, int from, int to) {
        double s = 0;
        for (int i = from; i < to; i++) s += a[i];
        return s / (to - from);
    }

    private static String date(long min) {
        return LocalDate.ofInstant(Instant.ofEpochSecond(min * 60), EXCHANGE).toString();
    }
}
