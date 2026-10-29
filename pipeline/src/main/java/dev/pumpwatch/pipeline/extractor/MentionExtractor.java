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
 * raw-posts to mentions: one record per watchlist ticker linked by {@link TickerLinker}, keyed by ticker. The post
 * text is reduced to a SimHash and a new-account flag here and is not forwarded.
 */
public final class MentionExtractor {
    private static final Logger log = LoggerFactory.getLogger(MentionExtractor.class);
    /** Accounts younger than this when they post count as new. */
    static final Duration NEW_ACCOUNT = Duration.ofDays(30);

    private MentionExtractor() {}

    public static void build(StreamsBuilder b, Set<String> watchlist) {
        build(b, watchlist, SymbolList.load());
    }

    public static void build(StreamsBuilder b, Set<String> watchlist, SymbolList symbols) {
        b.stream(Topics.RAW_POSTS, Consumed.with(Serdes.String(), Serdes.String()).withTimestampExtractor(new EventTime()))
                .flatMap((k, v) -> extract(v, watchlist, symbols))
                .to(Topics.MENTIONS, Produced.with(Serdes.String(), Serdes.String()));
    }

    static List<KeyValue<String, String>> extract(String json, Set<String> watchlist, SymbolList symbols) {
        PostRecord p;
        try {
            p = Json.fromJson(json, PostRecord.class);
        } catch (IllegalArgumentException e) {
            log.warn("dropping unparseable post: {}", e.getMessage());
            return List.of();
        }
        if (!Validator.validate(p).isEmpty()) {
            log.warn("dropping invalid post {}: {}", p.postId(), Validator.validate(p));
            return List.of();
        }
        Set<String> found = TickerLinker.link(p.text(), symbols, watchlist);
        boolean fresh = p.authorCreatedAt() != null && p.authorCreatedAt().isAfter(p.eventTime().minus(NEW_ACCOUNT));
        long hash = SimHash.of(p.text());
        List<KeyValue<String, String>> out = new ArrayList<>();
        for (String t : found) {
            out.add(KeyValue.pair(t, Json.toJson(new Mention(Mention.VERSION, p.eventTime(), p.ingestTime(), t,
                    p.source(), p.postId(), p.authorId(), fresh, hash))));
        }
        return out;
    }
}
