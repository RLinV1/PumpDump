package dev.pumpwatch.connectors.rss;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Element;
import org.xml.sax.SAXException;

/**
 * RSS 2.0 {@code <item>} extraction with the JDK parser. DOCTYPE is rejected outright and external entities are off,
 * so a feed cannot make the parser read local files or call out (XXE).
 *
 * <p>shortcut: RSS 2.0 only (no Atom), and a feed that carries a DOCTYPE is rejected as a whole; add Atom when a
 * configured feed needs it.
 */
final class RssParser {
    record Item(String guid, String link, String title, String description, String pubDate) {}

    private RssParser() {}

    static List<Item> parse(byte[] xml) throws IOException, SAXException {
        var items = new ArrayList<Item>();
        var nodes = builder().parse(new ByteArrayInputStream(xml)).getElementsByTagName("item");
        for (int i = 0; i < nodes.getLength(); i++) {
            var e = (Element) nodes.item(i);
            items.add(new Item(text(e, "guid"), text(e, "link"), text(e, "title"), text(e, "description"),
                    text(e, "pubDate")));
        }
        return items;
    }

    private static javax.xml.parsers.DocumentBuilder builder() {
        try {
            var f = DocumentBuilderFactory.newInstance();
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            return f.newDocumentBuilder();
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException("JDK XML parser lacks a required security feature", e);
        }
    }

    private static String text(Element item, String tag) {
        var n = item.getElementsByTagName(tag);
        if (n.getLength() == 0) return null;
        var s = n.item(0).getTextContent().strip();
        return s.isEmpty() ? null : s;
    }
}
