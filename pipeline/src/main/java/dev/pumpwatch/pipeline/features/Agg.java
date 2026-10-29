package dev.pumpwatch.pipeline.features;

import java.util.HashSet;
import java.util.Set;

/** Per-window running totals for one ticker. Stored in the window state store as JSON. */
public record Agg(long mentions, Set<String> authors, long trades, long volume, long firstMs, double firstPrice,
                  long lastMs, double lastPrice) {
    public static final Agg EMPTY = new Agg(0, Set.of(), 0, 0, Long.MAX_VALUE, 0, Long.MIN_VALUE, 0);

    public static Agg mention(String author) {
        return new Agg(1, Set.of(author), 0, 0, Long.MAX_VALUE, 0, Long.MIN_VALUE, 0);
    }

    public static Agg trade(long ms, double price, long size) {
        return new Agg(0, Set.of(), 1, size, ms, price, ms, price);
    }

    public Agg merge(Agg o) {
        Set<String> a = new HashSet<>(authors);
        a.addAll(o.authors);
        boolean earlier = o.firstMs < firstMs;
        boolean later = o.lastMs > lastMs;
        return new Agg(mentions + o.mentions, a, trades + o.trades, volume + o.volume,
                earlier ? o.firstMs : firstMs, earlier ? o.firstPrice : firstPrice,
                later ? o.lastMs : lastMs, later ? o.lastPrice : lastPrice);
    }

    /** Price change from the earliest to the latest trade in the window; 0 without two trades' worth of data. */
    public double windowReturn() {
        return trades == 0 || firstPrice <= 0 ? 0.0 : lastPrice / firstPrice - 1.0;
    }
}
