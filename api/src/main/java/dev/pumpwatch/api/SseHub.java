package dev.pumpwatch.api;

import dev.pumpwatch.api.Views.Envelope;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Json;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Flag stream. Every client has a cursor (flag id); a poll reads newer flags from Postgres, so resume after a drop
 * is the same query as normal delivery and nothing here has to survive a restart.
 */
@Component
public class SseHub {
    static final int BATCH = 100;

    private static final class Client {
        final SseEmitter emitter;
        final String runId;
        final String owner;
        long cursor;
        Instant lastSent;

        Client(SseEmitter emitter, String runId, String owner, long cursor, Instant now) {
            this.emitter = emitter;
            this.owner = owner;
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

    @Autowired
    public SseHub(ReadRepository repo, ApiProperties props) {
        this(repo, props, Clock.systemUTC());
    }

    SseHub(ReadRepository repo, ApiProperties props, Clock clock) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
    }

    /** lastEventId null means "from now". owner is the rate-limit client key, so one client cannot fill every slot. */
    public SseEmitter subscribe(String runId, Long lastEventId, String owner) {
        if (full(owner)) throw new TooManyStreams();
        var emitter = new SseEmitter(30 * 60 * 1000L); // browsers reconnect with Last-Event-ID
        long cursor = lastEventId != null ? lastEventId : repo.maxFlagId(runId);
        var client = new Client(emitter, runId, owner, cursor, clock.instant());
        synchronized (clients) {
            if (full(owner)) throw new TooManyStreams();
            clients.add(client);
        }
        Runnable drop = () -> clients.remove(client);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        return emitter;
    }

    private boolean full(String owner) {
        return clients.size() >= props.maxStreams()
                || clients.stream().filter(c -> c.owner.equals(owner)).count() >= props.maxStreamsPerClient();
    }

    int clientCount() {
        return clients.size();
    }

    @Scheduled(fixedDelayString = "${api.poll-interval:PT1S}")
    public void tick() {
        // One query per run: it starts at the slowest viewer's cursor and each viewer keeps only flags newer than its own.
        // shortcut: a viewer resuming far behind makes its run page through BATCH flags per tick, fine until resumes are long.
        for (var group : clients.stream().collect(java.util.stream.Collectors.groupingBy(c -> c.runId)).entrySet()) {
            List<Client> viewers = group.getValue();
            List<FlagView> flags;
            try {
                long from = viewers.stream().mapToLong(c -> c.cursor).min().orElse(0);
                flags = repo.flagsAfter(group.getKey(), from, BATCH);
            } catch (Exception e) { // failed read: drop this run's viewers, the browsers reconnect
                viewers.forEach(c -> drop(c, e));
                continue;
            }
            for (Client c : viewers) {
                try {
                    boolean sent = false;
                    for (FlagView f : flags) {
                        if (f.id() <= c.cursor) continue;
                        c.emitter.send(SseEmitter.event().id(Long.toString(f.id())).name("flag")
                                .data(Json.toJson(Envelope.of(f)), MediaType.APPLICATION_JSON));
                        c.cursor = f.id();
                        c.lastSent = clock.instant();
                        sent = true;
                    }
                    if (!sent && c.lastSent.plus(props.heartbeat()).isBefore(clock.instant())) {
                        c.emitter.send(SseEmitter.event().comment("heartbeat"));
                        c.lastSent = clock.instant();
                    }
                } catch (Exception e) { // closed connection: drop this client, the browser reconnects
                    drop(c, e);
                }
            }
        }
    }

    private void drop(Client c, Exception e) {
        clients.remove(c);
        c.emitter.completeWithError(e);
    }
}
