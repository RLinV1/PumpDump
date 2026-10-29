package dev.pumpwatch.api.alerts;

import dev.pumpwatch.api.Views.FlagView;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Plans (cooldown, digest, dedupe) then delivers from the durable outbox. Log lines carry channel names and ids only:
 * a webhook URL is never logged, stored, or put in an error string.
 */
@Component
@ConditionalOnProperty(prefix = "alerts", name = "enabled", havingValue = "true")
public class AlertService {
    private static final Logger log = LoggerFactory.getLogger(AlertService.class);
    private static final int BATCH = 200;

    private final AlertStore store;
    private final WebhookSender sender;
    private final AlertProperties props;
    private final Clock clock;

    AlertService(AlertStore store, WebhookSender sender, AlertProperties props) {
        this(store, sender, props, Clock.systemUTC());
    }

    AlertService(AlertStore store, WebhookSender sender, AlertProperties props, Clock clock) {
        this.store = store;
        this.sender = sender;
        this.props = props;
        this.clock = clock;
        log.info("alerts enabled with {} webhook(s)", props.webhookUrls().size());
    }

    @Scheduled(fixedDelayString = "${alerts.interval:PT5S}")
    public void tick() {
        try {
            plan();
            deliver();
        } catch (RuntimeException e) { // database trouble: try again next tick
            log.warn("alert tick failed: {}", e.getClass().getSimpleName());
        }
    }

    void plan() {
        Instant now = clock.instant();
        for (int i = 0; i < props.webhookUrls().size(); i++) {
            String ch = AlertProperties.channel(i);
            List<FlagView> pending = store.pendingFlags(ch, now.minus(props.maxFlagAge()), BATCH);
            if (pending.isEmpty()) continue;
            var plan = AlertPlanner.plan(pending, store.lastAlerted(ch),
                    store.singlesSince(ch, now.minusSeconds(60)), props.cooldown(), props.maxPerMinute());
            plan.singles().forEach(f -> store.enqueueSingle(ch, f, AlertMessages.single(f, props.linkBase()), now));
            if (!plan.digest().isEmpty())
                store.enqueueDigest(ch, plan.digest(), AlertMessages.digest(plan.digest(), props.linkBase()), now);
            store.suppress(ch, plan.suppressed());
        }
    }

    void deliver() {
        Instant now = clock.instant();
        for (var d : store.due(now, 50)) {
            String url = urlOf(d.channel());
            if (url == null) {
                store.markFailed(d.id(), "channel no longer configured", null);
                continue;
            }
            String error;
            try {
                int status = sender.post(url, d.payload());
                error = status / 100 == 2 ? null : "HTTP " + status;
            } catch (Exception e) {
                error = e.getClass().getSimpleName(); // messages of URI/IO errors can contain the URL
            }
            if (error == null) {
                store.markSent(d.id(), clock.instant());
            } else {
                boolean last = d.attempts() + 1 >= props.maxAttempts();
                store.markFailed(d.id(), error, last ? null : now.plus(backoff(d.attempts())));
                log.warn("alert {} on {} failed ({}), attempt {}", d.id(), d.channel(), error, d.attempts() + 1);
            }
        }
    }

    Duration backoff(int attemptsSoFar) {
        long factor = 1L << Math.min(attemptsSoFar, 20);
        Duration d = props.backoffBase().multipliedBy(factor);
        return d.compareTo(props.backoffMax()) > 0 ? props.backoffMax() : d;
    }

    private String urlOf(String channel) {
        for (int i = 0; i < props.webhookUrls().size(); i++)
            if (AlertProperties.channel(i).equals(channel)) return props.webhookUrls().get(i);
        return null;
    }
}
