package dev.pumpwatch.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Adds the not-advice header to every response and applies a per-client-address token bucket. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter extends OncePerRequestFilter {
    private static final int MAX_CLIENTS = 10_000;
    private static final String TOO_MANY = "{\"notice\":\"" + Views.NOTICE + "\",\"error\":\"rate limit exceeded\"}";

    private static final class Bucket {
        double tokens;
        Instant last;
    }

    private final Clock clock;
    private final double perSecond;
    private final double burst;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Autowired
    public RateLimitFilter(ApiProperties props) {
        this(props, Clock.systemUTC());
    }

    RateLimitFilter(ApiProperties props, Clock clock) {
        this.clock = clock;
        this.perSecond = props.rateLimitPerMinute() / 60.0;
        this.burst = Math.max(1, props.burst());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        res.setHeader(Views.NOTICE_HEADER, Views.NOTICE);
        // shortcut: keyed on the socket address; behind a proxy every client looks the same, so key on a trusted
        // forwarded-for header when this is deployed behind one.
        long retryAfterSeconds = take(req.getRemoteAddr());
        if (retryAfterSeconds == 0) {
            chain.doFilter(req, res);
            return;
        }
        res.setStatus(429);
        res.setHeader("Retry-After", Long.toString(retryAfterSeconds));
        res.setContentType("application/json");
        res.getWriter().write(TOO_MANY);
    }

    /** 0 when a token was taken, otherwise whole seconds until one is available. */
    private long take(String client) {
        if (buckets.size() > MAX_CLIENTS) buckets.clear(); // shortcut: crude eviction, a reset only grants one burst
        Instant now = clock.instant();
        Bucket b = buckets.computeIfAbsent(client, k -> {
            var nb = new Bucket();
            nb.tokens = burst;
            nb.last = now;
            return nb;
        });
        synchronized (b) {
            double elapsed = (now.toEpochMilli() - b.last.toEpochMilli()) / 1000.0;
            b.tokens = Math.min(burst, b.tokens + elapsed * perSecond);
            b.last = now;
            if (b.tokens >= 1) {
                b.tokens -= 1;
                return 0;
            }
            return Math.max(1, (long) Math.ceil((1 - b.tokens) / perSecond));
        }
    }
}
