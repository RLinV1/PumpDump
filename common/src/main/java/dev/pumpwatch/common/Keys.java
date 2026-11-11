package dev.pumpwatch.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

public final class Keys {
    private Keys() {}

    public static String postKey(String source, String postId) {
        return source + ":" + postId;
    }

    public static String tickerKey(String ticker) {
        return ticker.toUpperCase(Locale.ROOT);
    }

    /** One-way pseudonymous author key (truncated SHA-256 of the source's author id): groups posts, hides the handle/DID. */
    public static String authorKey(String authorId) {
        try {
            var d = MessageDigest.getInstance("SHA-256").digest(authorId.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 12);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
