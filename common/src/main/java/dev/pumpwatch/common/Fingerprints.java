package dev.pumpwatch.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

public final class Fingerprints {
    private static final Pattern BOILERPLATE =
            Pattern.compile("^(press release|breaking news|breaking|update|exclusive|alert)\\s*[:\\-]\\s*");
    private static final Pattern PUNCT = Pattern.compile("[^\\p{L}\\p{N}\\s]");

    private Fingerprints() {}

    public static String normalize(String headline) {
        String s = headline.toLowerCase(Locale.ROOT).strip();
        // strip the prefix before punctuation removal, while its colon is still there
        s = BOILERPLATE.matcher(s).replaceFirst("");
        return PUNCT.matcher(s).replaceAll("").replaceAll("\\s+", " ").strip();
    }

    public static String fingerprint(String headline) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(normalize(headline).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
