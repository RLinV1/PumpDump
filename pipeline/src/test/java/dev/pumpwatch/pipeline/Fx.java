package dev.pumpwatch.pipeline;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.SchemaVersions;
import dev.pumpwatch.common.TickRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Properties;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.Topology;
import org.apache.kafka.streams.TopologyTestDriver;

/** Test fixtures shared by the stage tests. All times are minutes:seconds after 2026-01-01T00:00:00Z. */
public final class Fx {
    public static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    private Fx() {}

    public static Instant at(int min, int sec) {
        return T0.plusSeconds(min * 60L + sec);
    }

    public static TopologyTestDriver driver(Topology t) {
        Properties p = new Properties();
        p.put(StreamsConfig.APPLICATION_ID_CONFIG, "test");
        p.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "dummy:1234");
        p.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.StringSerde.class);
        p.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.StringSerde.class);
        return new TopologyTestDriver(t, p);
    }

    public static String post(Instant when, String author, String text) {
        return Json.toJson(new PostRecord(SchemaVersions.POST, when, when.plusSeconds(1), "reddit",
                "p-" + when.toEpochMilli() + author, author, when.minusSeconds(86400), text));
    }

    public static String tick(Instant when, String ticker, String price, long size) {
        return Json.toJson(new TickRecord(SchemaVersions.TICK, when, when.plusSeconds(1), ticker,
                new BigDecimal(price), size, "IEX"));
    }
}
