package dev.pumpwatch.api;

import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Headers;
import dev.pumpwatch.common.Json;
import dev.pumpwatch.common.Score;
import dev.pumpwatch.common.Topics;
import dev.pumpwatch.common.Validator;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** Copies scores and flags (live and replay-run topics) into the read tables. Invalid records are skipped. */
@Component
public class Ingest {
    private static final Logger log = LoggerFactory.getLogger(Ingest.class);
    private final ReadRepository repo;

    public Ingest(ReadRepository repo) {
        this.repo = repo;
    }

    @KafkaListener(topicPattern = "(replay\\.[A-Za-z0-9-]+\\.)?(" + Topics.SCORES + "|" + Topics.FLAGS + ")")
    public void onRecords(List<ConsumerRecord<String, String>> records) {
        records.forEach(this::handle);
    }

    void handle(ConsumerRecord<String, String> r) {
        String runId = RunIds.of(r.topic(), header(r, Headers.RUN_ID));
        if (!RunIds.VALID.matcher(runId).matches()) {
            log.warn("skipping record with bad run id on {}", r.topic());
            return;
        }
        try {
            if (r.topic().endsWith(Topics.SCORES)) {
                Score s = Json.fromJson(r.value(), Score.class);
                if (ok(Validator.validate(s), r)) repo.saveScore(runId, r.topic(), r.partition(), r.offset(), s);
            } else {
                Flag f = Json.fromJson(r.value(), Flag.class);
                if (ok(Validator.validate(f), r)) repo.saveFlag(runId, r.topic(), r.partition(), r.offset(), f);
            }
        } catch (IllegalArgumentException e) { // unparseable payload; database errors propagate and are retried
            log.warn("skipping unparseable record {}-{}@{}: {}", r.topic(), r.partition(), r.offset(), e.getMessage());
        }
    }

    private static boolean ok(List<String> problems, ConsumerRecord<?, ?> r) {
        if (problems.isEmpty()) return true;
        log.warn("skipping invalid record {}-{}@{}: {}", r.topic(), r.partition(), r.offset(), problems);
        return false;
    }

    private static String header(ConsumerRecord<?, ?> r, String name) {
        Header h = r.headers().lastHeader(name);
        return h == null ? null : new String(h.value(), StandardCharsets.UTF_8);
    }
}
