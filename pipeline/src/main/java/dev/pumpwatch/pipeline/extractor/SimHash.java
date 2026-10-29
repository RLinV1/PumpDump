package dev.pumpwatch.pipeline.extractor;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** 64-bit SimHash over lower-cased word tokens. Only the hash leaves the extractor, never the text. */
public final class SimHash {
    /** Posts within this many differing bits count as near-duplicates. */
    public static final int NEAR = 3;

    private SimHash() {}

    public static long of(String text) {
        int[] v = new int[64];
        boolean any = false;
        for (String tok : text.toLowerCase(Locale.ROOT).split("[^a-z0-9$]+")) {
            if (tok.isEmpty()) continue;
            any = true;
            long h = fnv(tok);
            for (int i = 0; i < 64; i++) v[i] += ((h >>> i) & 1) == 1 ? 1 : -1;
        }
        long out = 0;
        if (any) for (int i = 0; i < 64; i++) if (v[i] > 0) out |= 1L << i;
        return out;
    }

    public static boolean near(long a, long b) {
        return Long.bitCount(a ^ b) <= NEAR;
    }

    private static long fnv(String s) {
        long h = 0xcbf29ce484222325L;
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
            h ^= b & 0xff;
            h *= 0x100000001b3L;
        }
        return h;
    }
}
