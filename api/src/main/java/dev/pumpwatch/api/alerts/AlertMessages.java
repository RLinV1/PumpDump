package dev.pumpwatch.api.alerts;

import dev.pumpwatch.api.Views;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.common.Flag;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/** Message text. Only scores, counts and feature contributions: no post text, no authors. */
final class AlertMessages {
    private AlertMessages() {}

    private static String base(String linkBase) {
        return linkBase.replaceAll("/+$", "");
    }

    static String link(String linkBase, String ticker) {
        return base(linkBase) + "/api/v1/tickers/" + ticker + "/timeline";
    }

    static String single(FlagView f, String linkBase) {
        Flag.Evidence e = f.evidence();
        String drivers = e.topContributors().stream()
                .map(c -> String.format(Locale.ROOT, "%s %+.0f", c.featureGroup(), c.delta()))
                .collect(Collectors.joining(", "));
        String catalyst = e.catalyst().found() ? "possible catalyst found (" + e.catalyst().items().size() + " items)"
                : "no catalyst found";
        return String.format(Locale.ROOT,
                "Pumpwatch flag: %s score %.0f at %s.%nDrivers: %s. Posts %d, trades %d, %s.%nTimeline: %s%nModel: %s. %s",
                f.ticker(), e.score(), f.raisedAt(), drivers.isEmpty() ? "n/a" : drivers, e.postCount(),
                e.tradeCount(), catalyst, link(linkBase, f.ticker()), e.modelVersion(), Views.NOTICE);
    }

    static String digest(List<FlagView> flags, String linkBase) {
        String list = flags.stream().map(f -> String.format(Locale.ROOT, "%s %.0f", f.ticker(), f.evidence().score()))
                .collect(Collectors.joining(", "));
        String models = flags.stream().map(f -> f.evidence().modelVersion()).distinct().sorted()
                .collect(Collectors.joining(", "));
        return String.format(Locale.ROOT, "Pumpwatch digest: %d more flags: %s.%nDetails: %s/api/v1/flags%nModel: %s. %s",
                flags.size(), list, base(linkBase), models, Views.NOTICE);
    }
}
