package dev.pumpwatch.connectors.sec;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Pulls the 8-K item codes out of an EDGAR filing index page (the "Items" block only). */
final class FilingIndexParser {
    private static final Pattern BLOCK = Pattern.compile("Items</div>\\s*<div class=\"info\">(.*?)</div>", Pattern.DOTALL);
    private static final Pattern ITEM = Pattern.compile("Item\\s+(\\d{1,2}\\.\\d{2})");

    private FilingIndexParser() {}

    static List<String> itemCodes(String html) {
        var out = new ArrayList<String>();
        var block = BLOCK.matcher(html);
        if (!block.find()) return out;
        var m = ITEM.matcher(block.group(1));
        while (m.find()) if (!out.contains(m.group(1))) out.add(m.group(1));
        return out;
    }
}
