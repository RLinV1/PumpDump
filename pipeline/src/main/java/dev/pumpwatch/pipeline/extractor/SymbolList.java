package dev.pumpwatch.pipeline.extractor;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

/** The known-symbol list and the subset of it that are also common words. Loaded from classpath resources. */
public record SymbolList(Set<String> known, Set<String> commonWords) {
    public static final String KNOWN_RESOURCE = "/symbols/known-symbols.txt";
    public static final String COMMON_RESOURCE = "/symbols/common-words.txt";

    public SymbolList {
        known = Set.copyOf(known);
        commonWords = Set.copyOf(commonWords);
    }

    public static SymbolList load() {
        return new SymbolList(read(KNOWN_RESOURCE), read(COMMON_RESOURCE));
    }

    static Set<String> read(String resource) {
        try (InputStream in = SymbolList.class.getResourceAsStream(resource)) {
            if (in == null) throw new IllegalStateException("missing resource " + resource);
            return parse(new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** One symbol per line; blank lines and lines starting with # are skipped; symbols are upper-cased. */
    static Set<String> parse(BufferedReader r) throws IOException {
        Set<String> out = new TreeSet<>();
        for (String line = r.readLine(); line != null; line = r.readLine()) {
            String s = line.strip();
            if (!s.isEmpty() && !s.startsWith("#")) out.add(s.toUpperCase(Locale.ROOT));
        }
        return out;
    }
}
