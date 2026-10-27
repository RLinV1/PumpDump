package dev.pumpwatch.connectors.sec;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;

/** CIK to ticker mapping kept in Postgres so a restart without network still maps filers. */
interface TickerStore {
    record Entry(String cik, String ticker, String title) {}

    /** @param cik without leading zeros, see {@link #normalize} */
    Optional<String> ticker(String cik);

    void saveAll(List<Entry> entries);

    static String normalize(String cik) {
        var s = cik.strip().replaceFirst("^0+", "");
        return s.isEmpty() ? "0" : s;
    }

    /** Parses company_tickers.json. A company with several tickers keeps the first listed one. */
    static List<Entry> parse(String json) throws IOException {
        ObjectMapper m = Json.newMapper();
        var byCik = new LinkedHashMap<String, Entry>();
        for (var n : m.readTree(json)) {
            var cik = n.path("cik_str").asText("");
            var ticker = n.path("ticker").asText("");
            if (cik.isEmpty() || ticker.isEmpty()) continue;
            byCik.putIfAbsent(normalize(cik), new Entry(normalize(cik), ticker, n.path("title").asText(null)));
        }
        return new ArrayList<>(byCik.values());
    }
}
