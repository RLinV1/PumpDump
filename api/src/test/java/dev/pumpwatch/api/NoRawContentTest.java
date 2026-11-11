package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import dev.pumpwatch.api.Views.Envelope;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Compliance: nothing the API returns or streams can carry post text or an author, by shape and by content. */
class NoRawContentTest {
    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");
    static final Pattern BANNED = Pattern.compile("(?i)text|author|handle|\\bdid\\b|body|snippet|username|displayname");
    static final String POST_TEXT = "RAW-POST-TEXT-xyz";
    static final String AUTHOR = "did:plc:author-handle-xyz";

    /** Every record reachable from the public response types, including the Kafka records they are copied from. */
    @Test
    void noPublicResponseTypeHasATextOrAuthorField() {
        var seen = new HashSet<Class<?>>();
        var offenders = new ArrayList<String>();
        for (Class<?> c : List.of(Envelope.class, Views.ScoreView.class, Views.FlagView.class, Views.Timeline.class,
                Score.class, Flag.class)) walk(c, seen, offenders);
        assertThat(seen).contains(Flag.Evidence.class, Views.ScorePoint.class, Views.FlagMarker.class);
        assertThat(offenders).isEmpty();
    }

    private static void walk(Class<?> c, Set<Class<?>> seen, List<String> offenders) {
        if (!c.isRecord() || !seen.add(c)) return;
        for (RecordComponent rc : c.getRecordComponents()) {
            if (BANNED.matcher(rc.getName()).find()) offenders.add(c.getSimpleName() + "." + rc.getName());
            walk(rc.getType(), seen, offenders);
            if (rc.getGenericType() instanceof ParameterizedType p)
                for (var a : p.getActualTypeArguments()) if (a instanceof Class<?> k) walk(k, seen, offenders);
        }
    }

    /** A producer that wrongly adds text and author to scores and flags: none of it reaches a stored or served view. */
    @Test
    void polluteInputNeverReachesWatchlistTimelineFlagsOrSseEvents() {
        var repo = mock(ReadRepository.class);
        var ingest = new Ingest(repo);
        var evidence = new Flag.Evidence(70, "rules-1", List.of(new Flag.Contributor("chatter", 30)), 5, 2,
                new Flag.CatalystCheck(false, T, T, List.of()));
        String flagJson = pollute(Json.toJson(new Flag(1, T, T, "GME", T, evidence)));
        String scoreJson = pollute(Json.toJson(new Score(1, T, T, "GME", T, 55, "rules-1", Set.of("news"))));
        ingest.handle(new ConsumerRecord<>("flags", 0, 1L, "GME", flagJson));
        ingest.handle(new ConsumerRecord<>("scores", 0, 1L, "GME", scoreJson));
        var f = ArgumentCaptor.forClass(Flag.class);
        var s = ArgumentCaptor.forClass(Score.class);
        verify(repo).saveFlag(anyString(), anyString(), anyInt(), anyLong(), f.capture());
        verify(repo).saveScore(anyString(), anyString(), anyInt(), anyLong(), s.capture());

        var flagView = new Views.FlagView(1, f.getValue().ticker(), f.getValue().raisedAt(), f.getValue().evidence());
        var scoreView = new Views.ScoreView(s.getValue().ticker(), s.getValue().score(), s.getValue().modelVersion(),
                s.getValue().windowEnd(), s.getValue().ingestTime(), s.getValue().staleSources());
        var timeline = new Views.Timeline("GME", T.minusSeconds(60), T, List.of(new Views.ScorePoint(T, 55, "rules-1")),
                List.of(new Views.FlagMarker(1, T, 70)));
        // watchlist, flags and timeline bodies, and the SSE event (an Envelope of one FlagView)
        for (Object body : List.of(Envelope.of(List.of(scoreView)), Envelope.of(List.of(flagView)),
                Envelope.of(timeline), Envelope.of(flagView))) {
            assertThat(Json.toJson(body)).doesNotContain(POST_TEXT).doesNotContain(AUTHOR)
                    .doesNotContain("\"text\"").doesNotContain("authorId");
        }
    }

    private static String pollute(String json) {
        return json.replaceFirst("\\{", "{\"text\":\"" + POST_TEXT + "\",\"authorId\":\"" + AUTHOR + "\",");
    }
}
