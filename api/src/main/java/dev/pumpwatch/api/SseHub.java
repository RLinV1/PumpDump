package dev.pumpwatch.api;

import dev.pumpwatch.api.Views.Envelope;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Json;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Flag stream. Every client has a cursor (flag id); a poll reads newer flags from Postgres, so resume after a drop
 * is the same query as normal delivery and nothing here has to survive a restart.
 * shortcut: one query per client per poll, fine up to api.max-streams, use a shared fan-out beyond that.
 */
@Component
public class SseHub {
    static final int BATCH = 100;

    private static final class Client {
        final SseEmitter emitter;
        final String runId;
        long cursor;
        Instant lastSent;

        Client(SseEmitter emitter, String runId, long cursor, Instant now) {
            this.emitter = emitter;
            this.runId = runId;
            this.cursor = cursor;
            this.lastSent = now;
        }
    }

    public static class TooManyStreams extends RuntimeException {}

    private final ReadRepository repo;
    private final ApiProperties props;
    private final Clock clock;
    private final List<Client> clients = new CopyOnWriteArrayList<>();

    public SseHub(ReadRepository repo, ApiProperties props) {
        this(repo, props, Clock.systemUTC());
    }

    SseHub(ReadRepository repo, ApiProperties props, Clock clock) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
    }

    /** lastEventId null means "from now". */
    public SseEmitter subscribe(String runId, Long lastEventId) {
        if (clients.size() >= props.maxStreams()) throw new TooManyStreams();
        var emitter = new SseEmitter(30 * 60 * 1000L); // browsers reconnect with Last-Event-ID
        long cursor = lastEventId != null ? lastEventId : repo.maxFlagId(runId);
        var client = new Client(emitter, runId, cursor, clock.instant());
        clients.add(client);
        Runnable drop = () -> clients.remove(client);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        return emitter;
    }

    int clientCount() {
        return clients.size();
    }

    @Scheduled(fixedDelayString = "${api.poll-interval:PT1S}")
    public void tick() {
        for (Client c : clients) {
            try {
                List<FlagView> flags = repo.flagsAfter(c.runId, c.cursor, BATCH);
                for (FlagView f : flags) {
                    c.emitter.send(SseEmitter.event().id(Long.toString(f.id())).name("flag")
                            .data(Json.toJson(Envelope.of(f)), MediaType.APPLICATION_JSON));
                    c.cursor = f.id();
                    c.lastSent = clock.instant();
                }
                if (flags.isEmpty() && c.lastSent.plus(props.heartbeat()).isBefore(clock.instant())) {
                    c.emitter.send(SseEmitter.event().comment("heartbeat"));
                    c.lastSent = clock.instant();
                }
            } catch (Exception e) { // closed connection or failed read: drop this client, the browser reconnects
                clients.remove(c);
                c.emitter.completeWithError(e);
            }
        }
    }
}
