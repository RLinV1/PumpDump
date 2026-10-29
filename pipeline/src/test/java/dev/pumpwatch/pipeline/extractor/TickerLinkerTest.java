package dev.pumpwatch.pipeline.extractor;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TickerLinkerTest {
    static final SymbolList SYMS = SymbolList.load();
    static final Set<String> WATCH = Set.of("GME", "ON", "IT", "ALL");

    Set<String> link(String text) {
        return TickerLinker.link(text, SYMS, WATCH);
    }

    @Test
    void loaderSkipsCommentsAndBlankLinesAndUpperCases() throws IOException {
        assertThat(SymbolList.parse(new BufferedReader(new StringReader("# c\n\n gme \nOn\n")))).containsExactly("GME", "ON");
    }

    @Test
    void shippedListsAreConsistent() {
        assertThat(SYMS.known()).contains("GME", "AMC", "SNDL");
        assertThat(SYMS.known()).containsAll(SYMS.commonWords());
    }

    @Test
    void cashtagLinksAnyKnownSymbolIncludingCommonWords() {
        assertThat(link("$gme and $ON and $IT")).containsExactly("GME", "IT", "ON");
    }

    @Test
    void bareNonCommonUppercaseSymbolLinks() {
        assertThat(link("GME is up")).containsExactly("GME");
        assertThat(link("gme is up")).isEmpty();
    }

    @Test
    void commonWordWithoutCashtagOrContextDoesNotLink() {
        assertThat(link("IT is ON and ALL is well")).isEmpty();
    }

    @Test
    void commonWordLinksWithConfirmingContext() {
        assertThat(link("long ON stock")).containsExactly("ON");
        assertThat(link("NASDAQ: IT to the moon")).containsExactly("IT");
        assertThat(link("the ticker ALL looks cheap")).containsExactly("ALL");
        assertThat(link("buying IT calls")).containsExactly("IT");
    }

    @Test
    void unknownOrOffWatchlistSymbolsAreIgnored() {
        assertThat(link("$ZZZZ $AMC AMC")).isEmpty();
    }
}
