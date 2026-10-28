package dev.pumpwatch.pipeline.features;

import dev.pumpwatch.pipeline.extractor.SimHash;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Per-window running totals for one ticker, also the delta type that flows into the window aggregation. Stored in
 * the window state store as JSON. Every merge is order-independent, so a replay that delivers records in another
 * order inside the grace period gives the same totals.
 *
 * @param secs  last trade of each second (key = epoch second), used for return and realised volatility
 * @param ms    latest event time folded in
 * @param cats  catalyst events; only carried by catalyst deltas, never kept in a window total
 */
public record Agg(long mentions, Set<String> authors, long newAccounts, List<Long> hashes, long trades, long volume,
                  long dollarMicros, Map<Long, Pt> secs, long ms, List<Cat> cats) {
    /** shortcut: duplicate detection keeps the smallest 2000 hashes per window, to bound state and the O(n^2) pass. */
    public static final int MAX_HASHES = 2000;
    public static final Agg EMPTY =
            new Agg(0, Set.of(), 0, List.of(), 0, 0, 0, Map.of(), Long.MIN_VALUE, List.of());

    /** Last trade seen inside one second. */
    public record Pt(long ms, double price) {}

    public Agg {
        authors = authors == null ? Set.of() : authors;
        hashes = hashes == null ? List.of() : hashes;
        secs = secs == null ? Map.of() : secs;
        cats = cats == null ? List.of() : cats;
    }

    public static Agg mention(long ms, String author, boolean newAccount, long hash) {
        return new Agg(1, Set.of(author), newAccount ? 1 : 0, List.of(hash), 0, 0, 0, Map.of(), ms, List.of());
    }

    public static Agg trade(long ms, double price, long size) {
        return new Agg(0, Set.of(), 0, List.of(), 1, size, Math.round(price * size * 1e6), Map.of(Math.floorDiv(ms, 1000), new Pt(ms, price)),
                ms, List.of());
    }

    public static Agg catalyst(Cat c) {
        return new Agg(0, Set.of(), 0, List.of(), 0, 0, 0, Map.of(), c.ms(), List.of(c));
    }

    /** Folds a delta into a window total. Catalysts are ignored here; they live in {@link Ctx}. */
    public Agg merge(Agg o) {
        Set<String> a = new HashSet<>(authors);
        a.addAll(o.authors);
        List<Long> h = new ArrayList<>(hashes);
        h.addAll(o.hashes);
        h = h.stream().sorted().limit(MAX_HASHES).toList();
        Map<Long, Pt> s = new TreeMap<>(secs);
        o.secs.forEach((k, p) -> s.merge(k, p, (x, y) -> y.ms() > x.ms() || (y.ms() == x.ms() && y.price() > x.price()) ? y : x));
        return new Agg(mentions + o.mentions, a, newAccounts + o.newAccounts, h, trades + o.trades, volume + o.volume,
                dollarMicros + o.dollarMicros, s, Math.max(ms, o.ms), List.of());
    }

    private TreeMap<Long, Pt> sorted() {
        return new TreeMap<>(secs);
    }

    /** Price change from the first to the last traded second in the window; 0 without trades. */
    public double windowReturn() {
        if (secs.isEmpty()) return 0.0;
        TreeMap<Long, Pt> t = sorted();
        double first = t.firstEntry().getValue().price();
        return first <= 0 ? 0.0 : t.lastEntry().getValue().price() / first - 1.0;
    }

    /** Realised volatility: square root of the summed squared log returns between consecutive traded seconds. */
    public double realisedVolatility() {
        double prev = 0, sum = 0;
        for (Pt p : sorted().values()) {
            if (prev > 0) sum += Math.pow(Math.log(p.price() / prev), 2);
            prev = p.price();
        }
        return Math.sqrt(sum);
    }

    public double newAccountShare() {
        return mentions == 0 ? 0.0 : (double) newAccounts / mentions;
    }

    /** Share of stored posts with another stored post within {@code SimHash.NEAR} bits. */
    public double duplicateShare() {
        int n = hashes.size(), dup = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (i != j && SimHash.near(hashes.get(i), hashes.get(j))) {
                    dup++;
                    break;
                }
            }
        }
        return n == 0 ? 0.0 : (double) dup / n;
    }
}
