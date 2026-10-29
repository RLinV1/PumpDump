package dev.pumpwatch.pipeline.features;

import java.util.List;

/** One catalyst: an 8-K filing (kind "filing", items = item codes) or a news article (kind "news", source = outlet). */
public record Cat(long ms, String kind, String source, List<String> items) {
    public static final String FILING = "filing";
    public static final String NEWS = "news";

    public Cat {
        items = items == null ? List.of() : items;
    }
}
