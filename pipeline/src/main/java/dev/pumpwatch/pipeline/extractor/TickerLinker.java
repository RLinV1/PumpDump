package dev.pumpwatch.pipeline.extractor;

import dev.pumpwatch.common.Keys;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Links post text to watchlist tickers. A cashtag ($GME, any case) links any known symbol. A bare upper-case symbol
 * links when it is not a common word; a common-word symbol (ON, IT, ALL) links only with confirming context.
 */
public final class TickerLinker {
    private static final Pattern CASHTAG = Pattern.compile("\\$([A-Za-z][A-Za-z.]{0,9})(?![A-Za-z.])");
    private static final Pattern BARE = Pattern.compile("(?<![A-Za-z0-9$.])([A-Z]{1,5})(?![A-Za-z0-9.])");
    private static final Pattern BEFORE =
            Pattern.compile("(?i)(?:\\b(?:nyse|nasdaq|amex)\\s*:\\s*|\\b(?:ticker|symbol)\\s+)$");
    private static final Pattern AFTER = Pattern.compile("(?i)^\\s+(?:stock|shares|calls?|puts?|ticker)\\b");
    private static final int CONTEXT_CHARS = 16;

    private TickerLinker() {}

    public static Set<String> link(String text, SymbolList symbols, Set<String> watchlist) {
        Set<String> found = new TreeSet<>();
        Matcher c = CASHTAG.matcher(text);
        while (c.find()) add(found, Keys.tickerKey(c.group(1)), symbols, watchlist);
        Matcher m = BARE.matcher(text);
        while (m.find()) {
            String sym = m.group(1);
            if (symbols.commonWords().contains(sym) && !confirmed(text, m.start(), m.end())) continue;
            add(found, sym, symbols, watchlist);
        }
        return found;
    }

    private static void add(Set<String> out, String sym, SymbolList symbols, Set<String> watchlist) {
        if (symbols.known().contains(sym) && watchlist.contains(sym)) out.add(sym);
    }

    private static boolean confirmed(String text, int start, int end) {
        String before = text.substring(Math.max(0, start - CONTEXT_CHARS), start);
        String after = text.substring(end, Math.min(text.length(), end + CONTEXT_CHARS));
        return BEFORE.matcher(before).find() || AFTER.matcher(after).find();
    }
}
