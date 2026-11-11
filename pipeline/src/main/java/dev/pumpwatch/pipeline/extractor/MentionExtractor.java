package dev.pumpwatch.pipeline.extractor;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.EventTime;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KeyValue;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.Produced;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * raw-posts to mentions: one record per watchlist ticker linked at ingestion, keyed by ticker. Carries the SimHash
 * and a new-account flag; raw text is never forwarded.
 */
public final class MentionExtractor {
    private static final Logger log = LoggerFactory.getLogger(MentionExtractor.class);
    /** Accounts younger than this when they post count as new. */
    static final Duration NEW_ACCOUNT = Duration.ofDays(30);

    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = Json.newMapper();

    private MentionExtractor() {}

    public static void build(StreamsBuilder b, Set<String> watchlist) {
        b.stream(Topics.RAW_POSTS, Consumed.with(Serdes.String(), Serdes.String()).withTimestampExtractor(new EventTime()))
                .flatMap((k, v) -> extract(v, watchlist))
                .to(Topics.MENTIONS, Produced.with(Serdes.String(), Serdes.String()));
    }

    /** Posts arrive already reduced to tickers and a SimHash (schema 2); deletion markers are not mentions. */
    static List<KeyValue<String, String>> extract(String json, Set<String> watchlist) {
        PostRecord p;
        try {
            if (MAPPER.readTree(json).path("deleted").asBoolean(false)) return List.of();
            p = Json.fromJson(json, PostRecord.class);
        } catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("dropping unparseable post: {}", e.getMessage());
            return List.of();
        }
        if (!Validator.validate(p).isEmpty()) {
            log.warn("dropping invalid post {}: {}", p.postId(), Validator.validate(p));
            return List.of();
        }
        boolean fresh = p.authorCreatedAt() != null && p.authorCreatedAt().isAfter(p.eventTime().minus(NEW_ACCOUNT));
        List<KeyValue<String, String>> out = new ArrayList<>();
        for (String t : new java.util.TreeSet<>(p.tickers())) {
            if (!watchlist.contains(t)) continue;
            out.add(KeyValue.pair(t, Json.toJson(new Mention(Mention.VERSION, p.eventTime(), p.ingestTime(), t,
                    p.source(), p.postId(), p.authorId(), fresh, p.simhash()))));
        }
        return out;
    }
}
