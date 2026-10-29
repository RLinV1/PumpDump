package dev.pumpwatch.connectors.sec;

import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

/** Parses the EDGAR current-filings Atom feed. DOCTYPEs are rejected outright, which blocks XXE. */
final class AtomFeedParser {
    record Entry(String accessionNumber, String cik, String form, Instant updated, URI indexUrl) {}

    private static final Pattern ACCESSION = Pattern.compile("accession-number=([\\w-]+)$");
    private static final Pattern TITLE = Pattern.compile("^(\\S+) - .*\\((\\d{10})\\)");

    private AtomFeedParser() {}

    /** Entries that do not parse, or do not link to sec.gov, are skipped; malformed or hostile XML throws. */
    static List<Entry> parse(String xml) throws IOException {
        var out = new ArrayList<Entry>();
        try {
            var f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            var doc = f.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
            var nodes = doc.getElementsByTagNameNS("*", "entry");
            for (int i = 0; i < nodes.getLength(); i++) {
                var e = entry((Element) nodes.item(i));
                if (e != null) out.add(e);
            }
        } catch (Exception ex) {
            throw new IOException("unreadable SEC feed: " + ex.getClass().getSimpleName(), ex);
        }
        return out;
    }

    private static Entry entry(Element e) {
        try {
            var title = TITLE.matcher(text(e, "title"));
            var acc = ACCESSION.matcher(text(e, "id"));
            var link = e.getElementsByTagNameNS("*", "link");
            if (!title.find() || !acc.find() || link.getLength() == 0) return null;
            var url = URI.create(((Element) link.item(0)).getAttribute("href"));
            if (!"https".equals(url.getScheme()) || url.getHost() == null
                    || !(url.getHost().equals("www.sec.gov") || url.getHost().endsWith(".sec.gov"))) return null;
            return new Entry(acc.group(1), title.group(2), title.group(1),
                    OffsetDateTime.parse(text(e, "updated")).toInstant(), url);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static String text(Element e, String tag) {
        var n = e.getElementsByTagNameNS("*", tag);
        return n.getLength() == 0 ? "" : n.item(0).getTextContent().trim();
    }
}
