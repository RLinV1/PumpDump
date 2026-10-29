package dev.pumpwatch.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.pumpwatch.common.Json;
import java.time.Instant;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.streams.processor.TimestampExtractor;

/** Reads eventTime from the JSON value, never the arrival time. An unreadable value returns -1, so Streams skips it. */
public class EventTime implements TimestampExtractor {
    private static final ObjectMapper MAPPER = Json.newMapper();

    @Override
    public long extract(ConsumerRecord<Object, Object> record, long partitionTime) {
        try {
            JsonNode t = MAPPER.readTree(String.valueOf(record.value())).get("eventTime");
            return Instant.parse(t.asText()).toEpochMilli();
        } catch (Exception e) {
            return -1L;
        }
    }
}
