package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Headers;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.SchemaVersions;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class IngestTest {
    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");
    ReadRepository repo = mock(ReadRepository.class);
    Ingest ingest = new Ingest(repo);

    static Flag flag() {
        var e = new Flag.Evidence(70, "rules-1", List.of(), 5, 2, new Flag.CatalystCheck(false, T, T, List.of()));
        return new Flag(SchemaVersions.FLAG, T, T, "GME", T, e);
    }

    @Test
    void runIdComesFromHeaderThenTopicThenLive() {
        assertThat(RunIds.of("flags", null)).isEqualTo("live");
        assertThat(RunIds.of("scores", "")).isEqualTo("live");
        assertThat(RunIds.of("replay.abc-1.flags", null)).isEqualTo("abc-1");
        assertThat(RunIds.of("flags", "xyz")).isEqualTo("xyz"); // replayed into a live topic
    }

    @Test
    void liveTopicIsLive_replayTopicIsNot() {
        ingest.handle(new ConsumerRecord<>("flags", 0, 1L, "GME", Json.toJson(flag())));
        verify(repo).saveFlag(eq("live"), eq("flags"), eq(0), eq(1L), any());
        ingest.handle(new ConsumerRecord<>("replay.run-9.flags", 0, 1L, "GME", Json.toJson(flag())));
        verify(repo).saveFlag(eq("run-9"), eq("replay.run-9.flags"), eq(0), eq(1L), any());
    }

    @Test
    void replayHeaderOnALiveTopicIsNotLive() {
        var r = new ConsumerRecord<>("flags", 0, 2L, "GME", Json.toJson(flag()));
        r.headers().add(Headers.RUN_ID, "run-9".getBytes(StandardCharsets.UTF_8));
        ingest.handle(r);
        verify(repo).saveFlag(eq("run-9"), eq("flags"), eq(0), eq(2L), any());
        verify(repo, never()).saveFlag(eq("live"), any(), anyInt(), anyLong(), any());
    }

    @Test
    void rawTextAndAuthorFieldsInAPayloadAreNeverStored() {
        String json = Json.toJson(flag()).replaceFirst("\\{", "{\"text\":\"RAW POST\",\"authorId\":\"someone\",");
        ingest.handle(new ConsumerRecord<>("flags", 0, 3L, "GME", json));
        var saved = ArgumentCaptor.forClass(Flag.class);
        verify(repo).saveFlag(eq("live"), eq("flags"), eq(0), eq(3L), saved.capture());
        String stored = Json.toJson(saved.getValue().evidence());
        assertThat(stored).doesNotContain("RAW POST").doesNotContain("someone").doesNotContain("authorId");
    }

    @Test
    void invalidAndUnparseableRecordsAreSkipped() {
        ingest.handle(new ConsumerRecord<>("flags", 0, 4L, "GME", "not json"));
        ingest.handle(new ConsumerRecord<>("flags", 0, 5L, "GME", Json.toJson(flag()).replace("GME", "gme")));
        ingest.handle(new ConsumerRecord<>("flags", 0, 6L, "GME", Json.toJson(flag())) {{
            headers().add(Headers.RUN_ID, "bad/id".getBytes(StandardCharsets.UTF_8));
        }});
        verify(repo, never()).saveFlag(any(), any(), anyInt(), anyLong(), any());
    }
}
