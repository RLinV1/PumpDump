package dev.pumpwatch.api.alerts;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Disabled by default. Webhook URLs are secrets: they come from ALERTS_WEBHOOK_URLS and are never printed. */
@ConfigurationProperties("alerts")
public record AlertProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue List<String> webhookUrls,
        @DefaultValue("http://localhost:3000") String linkBase,
        @DefaultValue("PT30M") Duration cooldown,
        @DefaultValue("5") int maxPerMinute,
        @DefaultValue("6") int maxAttempts,
        @DefaultValue("PT5S") Duration backoffBase,
        @DefaultValue("PT15M") Duration backoffMax,
        @DefaultValue("PT1H") Duration maxFlagAge) {

    public AlertProperties {
        webhookUrls = webhookUrls.stream().map(String::strip).filter(s -> !s.isEmpty()).toList();
    }

    /** Stable channel name per configured URL (by position). Reordering the env var changes the names. */
    public static String channel(int index) {
        return "webhook-" + (index + 1);
    }

    @Override
    public String toString() {
        return "AlertProperties[enabled=" + enabled + ", webhooks=" + webhookUrls.size() + "]";
    }
}
