package dev.pumpwatch.connectors.bluesky;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Keeps a post if it has a watchlist cashtag, or a watchlist ticker (upper case) plus a finance term. */
final class PostFilter {
    private static final Pattern CASHTAG = Pattern.compile("(?<![\\w$])\\$([A-Za-z]{1,5})\\b");
    private static final Pattern WORD = Pattern.compile("\\b[A-Z]{1,5}\\b");

    private final Set<String> tickers;
    private final List<String> terms;

    PostFilter(List<String> watchlist, List<String> financeTerms) {
        this.tickers = Set.copyOf(watchlist.stream().map(t -> t.trim().toUpperCase(Locale.ROOT)).toList());
        this.terms = financeTerms.stream().map(t -> t.toLowerCase(Locale.ROOT)).toList();
    }

    boolean keep(String text) {
        var m = CASHTAG.matcher(text);
        while (m.find()) if (tickers.contains(m.group(1).toUpperCase(Locale.ROOT))) return true;
        var lower = text.toLowerCase(Locale.ROOT);
        if (terms.stream().noneMatch(lower::contains)) return false;
        var w = WORD.matcher(text);
        while (w.find()) if (tickers.contains(w.group())) return true;
        return false;
    }
}
