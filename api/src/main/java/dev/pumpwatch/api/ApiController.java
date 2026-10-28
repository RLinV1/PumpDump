package dev.pumpwatch.api;

import dev.pumpwatch.api.Views.Envelope;
import dev.pumpwatch.api.Views.FlagMarker;
import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.api.Views.ScorePoint;
import dev.pumpwatch.api.Views.ScoreView;
import dev.pumpwatch.api.Views.Timeline;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Every endpoint serves live data unless a runId is given. */
@RestController
public class ApiController {
    static final Pattern TICKER = Pattern.compile("[A-Z]{1,5}");
    static final int MAX_FLAGS = 100;
    static final Duration MAX_SPAN = Duration.ofHours(48);

    private final ReadRepository repo;
    private final SseHub hub;

    public ApiController(ReadRepository repo, SseHub hub) {
        this.repo = repo;
        this.hub = hub;
    }

    @GetMapping("/api/v1/watchlist")
    Envelope<List<ScoreView>> watchlist(@RequestParam(required = false) String runId) {
        return Envelope.of(repo.latestScores(run(runId)));
    }

    @GetMapping("/api/v1/tickers/{ticker}/timeline")
    Envelope<Timeline> timeline(@PathVariable String ticker, @RequestParam(required = false) Instant from,
                                @RequestParam(required = false) Instant to, @RequestParam(required = false) String runId) {
        if (!TICKER.matcher(ticker).matches()) throw new BadRequest("ticker must be 1-5 upper-case letters A-Z");
        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(Duration.ofHours(6));
        if (!start.isBefore(end) || Duration.between(start, end).compareTo(MAX_SPAN) > 0)
            throw new BadRequest("from must be before to, and the range at most 48 hours");
        String run = run(runId);
        var scores = repo.scores(run, ticker, start, end).stream()
                .map(s -> new ScorePoint(s.windowEnd(), s.score(), s.modelVersion())).toList();
        var flags = repo.flags(run, ticker, start, end).stream()
                .map(f -> new FlagMarker(f.id(), f.raisedAt(), f.evidence().score())).toList();
        return Envelope.of(new Timeline(ticker, start, end, scores, flags));
    }

    @GetMapping("/api/v1/flags")
    Envelope<List<FlagView>> flags(@RequestParam(defaultValue = "20") int limit,
                                   @RequestParam(required = false) String runId) {
        if (limit < 1 || limit > MAX_FLAGS) throw new BadRequest("limit must be between 1 and " + MAX_FLAGS);
        return Envelope.of(repo.recentFlags(run(runId), limit));
    }

    @GetMapping("/api/v1/flags/stream")
    SseEmitter stream(@RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
                      @RequestParam(required = false) String runId) {
        Long id = null;
        if (lastEventId != null && !lastEventId.isBlank()) {
            try {
                id = Long.parseLong(lastEventId.trim());
            } catch (NumberFormatException e) {
                throw new BadRequest("Last-Event-ID must be a number");
            }
        }
        return hub.subscribe(run(runId), id);
    }

    private static String run(String runId) {
        if (runId == null) return RunIds.LIVE;
        if (!RunIds.VALID.matcher(runId).matches() || runId.equals(RunIds.LIVE)) throw new BadRequest("invalid runId");
        return runId;
    }

    static final class BadRequest extends RuntimeException {
        BadRequest(String m) {
            super(m);
        }
    }

    record Error(String notice, String error) {}

    @ExceptionHandler({BadRequest.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    ResponseEntity<Error> badRequest(Exception e) {
        String msg = e instanceof BadRequest ? e.getMessage() : "invalid request parameter";
        return ResponseEntity.badRequest().body(new Error(Views.NOTICE, msg));
    }

    @ExceptionHandler(SseHub.TooManyStreams.class)
    ResponseEntity<Error> busy(SseHub.TooManyStreams e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new Error(Views.NOTICE, "too many open streams"));
    }
}
