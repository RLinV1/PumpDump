package dev.pumpwatch.replay;

import com.fasterxml.jackson.databind.JsonNode;
import dev.pumpwatch.common.Headers;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Topics;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class Recorder {
    private static final Logger log = LoggerFactory.getLogger(Recorder.class);
    private final EventStore store;

    public Recorder(EventStore store) {
        this.store = store;
    }

    /** Offsets are committed by the container only after this returns, i.e. after the insert. */
    @KafkaListener(topics = {Topics.RAW_POSTS, Topics.TICKS, Topics.RAW_NEWS, Topics.RAW_FILINGS},
            groupId = "pumpwatch-recorder")
    public void onBatch(List<ConsumerRecord<String, String>> records) {
        List<RecordedEvent> events = toEvents(records);
        if (!events.isEmpty()) {
            store.insertAll(events);
        }
    }

    /** Skips replayed records and records without a parseable eventTime. */
    static List<RecordedEvent> toEvents(List<ConsumerRecord<String, String>> records) {
        List<RecordedEvent> out = new ArrayList<>();
        for (ConsumerRecord<String, String> r : records) {
            if (r.headers().lastHeader(Headers.REPLAY) != null) {
                continue;
            }
            try {
                JsonNode t = Json.newMapper().readTree(r.value()).get("eventTime");
                out.add(new RecordedEvent(0, r.topic(), r.key() == null ? "" : r.key(),
                        Instant.parse(t.asText()), r.value()));
            } catch (Exception e) {
                log.warn("not recording {}-{}@{}: no usable eventTime", r.topic(), r.partition(), r.offset());
            }
        }
        return out;
    }
}
