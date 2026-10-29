package dev.pumpwatch.pipeline.features;

import static dev.pumpwatch.pipeline.Fx.at;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.Fx;
import dev.pumpwatch.pipeline.extractor.Mention;
import dev.pumpwatch.pipeline.extractor.SimHash;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeMap;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FeatureStageTest {
    static final Instant FAR = Instant.parse("2036-01-01T00:00:00Z");
    TopologyTestDriver d;
    TestInputTopic<String, String> mentions;
    TestInputTopic<String, String> ticks;
    TestInputTopic<String, String> filings;
    TestInputTopic<String, String> news;
    TestOutputTopic<String, String> out;

    @BeforeEach
    void setUp() {
        StreamsBuilder b = new StreamsBuilder();
        FeatureStage.build(b, 2.0, Set.of("GME"));
        d = Fx.driver(b.build());
        mentions = d.createInputTopic(Topics.MENTIONS, Serdes.String().serializer(), Serdes.String().serializer());
        ticks = d.createInputTopic(Topics.TICKS, Serdes.String().serializer(), Serdes.String().serializer());
        filings = d.createInputTopic(Topics.RAW_FILINGS, Serdes.String().serializer(), Serdes.String().serializer());
        news = d.createInputTopic(Topics.RAW_NEWS, Serdes.String().serializer(), Serdes.String().serializer());
        out = d.createOutputTopic(Topics.FEATURES, Serdes.String().deserializer(), Serdes.String().deserializer());
    }

    @AfterEach
    void tearDown() {
        d.close();
    }

    static String mentionJson(Instant when, String author, boolean fresh, String text) {
        return Json.toJson(new Mention(1, when, when, "GME", "reddit", "p" + when + author, author, fresh, SimHash.of(text)));
    }

    /** Pipes with an arrival timestamp 10 years off, so only the payload eventTime can explain the windows. */
    void mention(Instant when, String author) {
        mentions.pipeInput("GME", mentionJson(when, author, false, "text by " + author), FAR);
    }

    void tick(Instant when, String price, long size) {
        ticks.pipeInput("GME", Fx.tick(when, "GME", price, size), FAR);
    }

    /** Moves stream time far ahead, which closes every window of interest (a different ticker, so GME is untouched). */
    void close() {
        ticks.pipeInput("CLS", Fx.tick(at(300, 0), "CLS", "1.00", 1), FAR);
    }

    /** Emitted value for a window, or null. */
    static Features latest(List<Features> all, int minutes, Instant end) {
        Features f = null;
        for (Features x : all) if (x.ticker().equals("GME") && x.windowMinutes() == minutes && x.windowEnd().equals(end)) f = x;
        return f;
    }

    List<Features> drain() {
        return out.readValuesToList().stream().map(v -> Json.fromJson(v, Features.class)).toList();
    }

    @Test
    void windowsUseEventTimeAndCarryTheDocumentedValues() {
        mention(at(10, 5), "a1");
        mention(at(10, 20), "a2");
        mention(at(10, 25), "a1");
        tick(at(10, 10), "10.00", 100);
        tick(at(10, 40), "11.00", 300);
        close();
        List<Features> all = drain();

        Features w = latest(all, 1, at(11, 0)); // window [10:00, 11:00)
        assertThat(w).isNotNull();
        assertThat(w.windowStart()).isEqualTo(at(10, 0));
        assertThat(w.eventTime()).isEqualTo(w.windowEnd());
        assertThat(w.ticker()).isEqualTo("GME");
        assertThat(w.values()).containsEntry("mentions", 3.0).containsEntry("distinctAuthors", 2.0)
                .containsEntry("trades", 2.0).containsEntry("volume", 400.0);
        assertThat(w.values().get("return")).isCloseTo(0.1, within(1e-9));
        assertThat(w.values().get("mentionRatio")).isCloseTo(3.0 / (2.0 * 1), within(1e-9));
        assertThat(Validator.validate(w)).isEmpty();
        // 5 and 30 minute windows ending at 15:00 and 30:00 both cover the records
        assertThat(latest(all, 5, at(15, 0)).values()).containsEntry("mentions", 3.0);
        assertThat(latest(all, 30, at(30, 0)).values()).containsEntry("trades", 2.0);
        // nothing is placed in a window built from the arrival time (year 2036)
        assertThat(all).allSatisfy(f -> assertThat(f.windowEnd()).isBefore(Instant.parse("2027-01-01T00:00:00Z")));
    }

    @Test
    void onlyFinalWindowsAreEmittedAndEachExactlyOnce() {
        mention(at(10, 5), "a1");
        mention(at(10, 20), "a2");
        assertThat(drain()).isEmpty(); // no window is closed yet: nothing is emitted ahead of the data
        mention(at(10, 50), "a3");
        mention(at(11, 40), "a4"); // stream time 11:40: the window ending 9:45... all earlier ones are closed
        List<Features> some = drain();
        assertThat(some).allSatisfy(f -> assertThat(f.windowEnd()).isBeforeOrEqualTo(at(11, 40).minus(FeatureStage.GRACE)));
        close();
        List<Features> rest = drain();
        List<Features> all = new ArrayList<>(some);
        all.addAll(rest);
        long keys = all.stream().filter(f -> f.ticker().equals("GME"))
                .map(f -> f.windowMinutes() + "@" + f.windowEnd()).distinct().count();
        assertThat(all.stream().filter(f -> f.ticker().equals("GME")).count()).isEqualTo(keys);
    }

    @Test
    void hoppingWindowsAdvanceEveryFifteenSeconds() {
        mention(at(10, 5), "a1");
        close();
        List<Features> ones = drain().stream().filter(f -> f.ticker().equals("GME") && f.windowMinutes() == 1).toList();
        assertThat(ones).hasSize(4);
        assertThat(ones).extracting(Features::windowStart)
                .containsExactlyInAnyOrder(at(9, 15), at(9, 30), at(9, 45), at(10, 0));
    }

    @Test
    void lateRecordWithinGraceIsIncluded() {
        mention(at(9, 0), "a1");
        mention(at(10, 0), "a2"); // stream time 10:00
        mention(at(8, 50), "a3"); // 70 s late, inside the 2 minute grace
        close();
        Features w = latest(drain(), 1, at(9, 30)); // [8:30, 9:30) holds 8:50 and 9:00
        assertThat(w.values()).containsEntry("mentions", 2.0).containsEntry("distinctAuthors", 2.0);
        assertThat(droppedRecords()).isZero();
    }

    @Test
    void lateRecordBeyondGraceCountsAMetricAndDoesNotChangeEmittedWindows() {
        mention(at(7, 0), "a1");
        mention(at(10, 0), "a2");
        drain();
        mention(at(7, 10), "late"); // 1-minute windows for 7:10 closed at 8:00 + 2 min = stream time 10:00
        List<Features> after = drain();
        assertThat(after).noneMatch(f -> f.windowMinutes() == 1);
        assertThat(droppedRecords()).isPositive();
    }

    @Test
    void copyPasteCampaignShowsHighNewAccountAndDuplicateShare() {
        for (int i = 0; i < 5; i++) {
            mentions.pipeInput("GME", mentionJson(at(10, 5 + i), "bot" + i, true, "GME to the moon buy now buy now!!"), FAR);
        }
        mentions.pipeInput("GME", mentionJson(at(10, 20), "old", false, "earnings call is on thursday afternoon"), FAR);
        close();
        Features w = latest(drain(), 1, at(11, 0));
        assertThat(w.values().get("newAccountShare")).isCloseTo(5.0 / 6, within(1e-9));
        assertThat(w.values().get("duplicateShare")).isCloseTo(5.0 / 6, within(1e-9));
    }

    @Test
    void marketFeaturesReturnVolatilityDollarVolume() {
        tick(at(10, 0), "10.00", 100);
        tick(at(10, 10), "11.00", 200);
        tick(at(10, 20), "10.50", 100);
        close();
        Features w = latest(drain(), 1, at(11, 0));
        assertThat(w.values().get("return")).isCloseTo(0.05, within(1e-9));
        assertThat(w.values().get("dollarVolume")).isCloseTo(1000 + 2200 + 1050, within(1e-6));
        double vol = Math.sqrt(Math.pow(Math.log(1.1), 2) + Math.pow(Math.log(10.5 / 11), 2));
        assertThat(w.values().get("volatility")).isCloseTo(vol, within(1e-9));
        assertThat(w.values().get("volumeRatio")).isEqualTo(1.0); // no hour of history yet: neutral
    }

    @Test
    void volumeJumpAgainstTrailingBaselineShowsInVolumeRatio() {
        tick(at(5, 0), "10.00", 600); // hour 0: 600 shares
        tick(at(125, 0), "10.00", 1000); // hour 2
        mentions.pipeInput("GME", mentionJson(at(5, 1), "a", false, "x"), FAR);
        mentions.pipeInput("GME", mentionJson(at(125, 1), "b", false, "y"), FAR);
        close();
        // window [125:00, 126:00): baseline = hour 0 bucket over a 2 hour span = 600 / 120 = 5 shares a minute
        Features w = latest(drain(), 1, at(126, 0));
        assertThat(w.values().get("volumeRatio")).isCloseTo(200.0, within(1e-9));
        // mention baseline = 1 mention / 120 min, so 1 mention in a 1 minute window is 120 times baseline
        assertThat(w.values().get("mentionRatio")).isCloseTo(120.0, within(1e-9));
    }

    @Test
    void filingBeforeTheMoveShowsInCatalystFeatures() {
        filings.pipeInput("x", Fx.filing(at(10, 0), "GME", "8-K", "2.02", "9.01"));
        filings.pipeInput("x", Fx.filing(at(11, 0), "GME", "4")); // not an 8-K: not a catalyst
        filings.pipeInput("x", Fx.filing(at(12, 0), "AMC", "8-K", "1.01")); // not on the watchlist
        news.pipeInput("x", Fx.news(at(30, 0), "reuters", "GME", "AMC"));
        news.pipeInput("x", Fx.news(at(31, 0), "reuters", "GME"));
        news.pipeInput("x", Fx.news(at(32, 0), "ap", "GME"));
        tick(at(50, 0), "10.00", 100); // the move starts 50 minutes after the filing
        filings.pipeInput("x", Fx.filing(at(55, 0), "GME", "8-K", "7.01")); // after the window: must not count
        close();
        Features w = latest(drain(), 1, at(51, 0));
        assertThat(w.values()).containsEntry("filings24h", 1.0).containsEntry("item.2.02", 1.0)
                .containsEntry("item.9.01", 1.0).containsEntry("newsOutlets6h", 2.0)
                .containsEntry("minutesSinceCatalyst", 19.0) // latest catalyst is the 32:00 article, window ends 51:00
                .containsEntry("catalystPrecededMove", 1.0)
                .doesNotContainKeys("item.7.01", "item.1.01");
    }

    @Test
    void noCatalystReportsTheSentinel() {
        tick(at(50, 0), "10.00", 100);
        close();
        Features w = latest(drain(), 1, at(51, 0));
        assertThat(w.values()).containsEntry("filings24h", 0.0).containsEntry("newsOutlets6h", 0.0)
                .containsEntry("minutesSinceCatalyst", Ctx.NO_CATALYST_MINUTES)
                .containsEntry("catalystPrecededMove", 0.0);
    }

    private double droppedRecords() {
        return d.metrics().entrySet().stream().filter(e -> e.getKey().name().equals("dropped-records-total"))
                .mapToDouble(e -> ((Number) e.getValue().metricValue()).doubleValue()).sum();
    }
}
