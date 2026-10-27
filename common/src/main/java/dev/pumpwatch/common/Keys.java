package dev.pumpwatch.common;

import java.util.Locale;

public final class Keys {
    private Keys() {}

    public static String postKey(String source, String postId) {
        return source + ":" + postId;
    }

    public static String tickerKey(String ticker) {
        return ticker.toUpperCase(Locale.ROOT);
    }
}
