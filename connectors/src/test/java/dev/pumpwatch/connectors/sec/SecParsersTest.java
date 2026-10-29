package dev.pumpwatch.connectors.sec;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SecParsersTest {
    private static String resource(String name) throws IOException {
        try (var in = SecParsersTest.class.getResourceAsStream("/sec/" + name)) {
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    @Test
    void parsesFeedEntries() throws Exception {
        var entries = AtomFeedParser.parse(resource("atom-current.xml"));
        assertThat(entries).hasSize(3);
        var first = entries.get(0);
        assertThat(first.accessionNumber()).isEqualTo("0000320193-26-000001");
        assertThat(first.cik()).isEqualTo("0000320193");
        assertThat(first.form()).isEqualTo("8-K");
        assertThat(first.updated()).isEqualTo(Instant.parse("2026-01-05T21:30:12Z"));
        assertThat(first.indexUrl().toString()).endsWith("0000320193-26-000001-index.htm");
        assertThat(entries.get(2).form()).isEqualTo("8-K/A");
    }

    @Test
    void extractsItemCodesFromIndexPageOnly() throws Exception {
        assertThat(FilingIndexParser.itemCodes(resource("filing-index-8k.htm"))).containsExactly("2.02", "8.01", "9.01");
        assertThat(FilingIndexParser.itemCodes("<html>no items</html>")).isEmpty();
    }

    @Test
    void xxePayloadIsNotResolved(@TempDir Path dir) throws Exception {
        var secret = dir.resolve("secret.txt");
        Files.writeString(secret, "TOP-SECRET");
        var xml = "<?xml version=\"1.0\"?><!DOCTYPE feed [<!ENTITY x SYSTEM \"" + secret.toUri() + "\">]>"
                + "<feed xmlns=\"http://www.w3.org/2005/Atom\"><entry><title>8-K - A (0000000001) (Filer)</title>"
                + "<link href=\"https://www.sec.gov/a-index.htm\"/><updated>2026-01-05T16:30:12-05:00</updated>"
                + "<id>urn:tag:sec.gov,2008:accession-number=&x;</id></entry></feed>";
        assertThatThrownBy(() -> AtomFeedParser.parse(xml)).isInstanceOf(IOException.class)
                .hasMessageNotContaining("TOP-SECRET");
    }

    @Test
    void ignoresEntriesLinkingOffSec() throws Exception {
        var xml = "<feed xmlns=\"http://www.w3.org/2005/Atom\"><entry><title>8-K - A (0000000001) (Filer)</title>"
                + "<link href=\"http://169.254.169.254/x\"/><updated>2026-01-05T16:30:12-05:00</updated>"
                + "<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id></entry></feed>";
        assertThat(AtomFeedParser.parse(xml)).isEmpty();
    }

    @Test
    void parsesTickerMappingFirstTickerPerCikWins() throws Exception {
        var json = "{\"0\":{\"cik_str\":320193,\"ticker\":\"AAPL\",\"title\":\"Apple Inc.\"},"
                + "\"1\":{\"cik_str\":320193,\"ticker\":\"AAPL2\",\"title\":\"Apple Inc.\"}}";
        List<TickerStore.Entry> e = TickerStore.parse(json);
        assertThat(e).containsExactly(new TickerStore.Entry("320193", "AAPL", "Apple Inc."));
        assertThat(TickerStore.normalize("0000320193")).isEqualTo("320193");
        assertThat(TickerStore.normalize("0000")).isEqualTo("0");
    }
}
