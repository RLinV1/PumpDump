package dev.pumpwatch.pipeline.extractor;

import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Keys;
import dev.pumpwatch.common.PostRecord;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import dev.pumpwatch.pipeline.EventTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KeyValue;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.Produced;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** raw-posts to mentions: one record per watchlist ticker found by cashtag, keyed by ticker. */
public final class MentionExtractor {
    private static final Logger log = LoggerFactory.getLogger(MentionExtractor.class);
    // shortcut: cashtags only, no confirmed-context or common-word handling; full linking is a later issue
    private static final Pattern CASHTAG = Pattern.compile("\\$([A-Za-z][A-Za-z.]{0,9})(?![A-Za-z.])");

    private MentionExtractor() {}

    public static void build(StreamsBuilder b, Set<String> watchlist) {
        b.stream(Topics.RAW_POSTS, Consumed.with(Serdes.String(), Serdes.String()).withTimestampExtractor(new EventTime()))
                .flatMap((k, v) -> extract(v, watchlist))
                .to(Topics.MENTIONS, Produced.with(Serdes.String(), Serdes.String()));
    }

    static List<KeyValue<String, String>> extract(String json, Set<String> watchlist) {
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
        Set<String> found = new TreeSet<>();
        Matcher m = CASHTAG.matcher(p.text());
        while (m.find()) {
            String t = Keys.tickerKey(m.group(1));
            if (watchlist.contains(t)) found.add(t);
        }
        List<KeyValue<String, String>> out = new ArrayList<>();
        for (String t : found) {
            out.add(KeyValue.pair(t, Json.toJson(new Mention(Mention.VERSION, p.eventTime(), p.ingestTime(), t,
                    p.source(), p.postId(), p.authorId()))));
        }
        return out;
    }
}
