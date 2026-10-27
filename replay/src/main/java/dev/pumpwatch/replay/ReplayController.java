package dev.pumpwatch.replay;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ReplayController {
    public record ReplayRequest(Instant from, Instant to, Double speed, boolean isolated) {}

    private final Replayer replayer;

    public ReplayController(Replayer replayer) {
        this.replayer = replayer;
    }

    @PostMapping("/replays")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> start(@RequestBody ReplayRequest req) {
        try {
            return Map.of("runId", replayer.start(req.from(), req.to(),
                    req.speed() == null ? 1.0 : req.speed(), req.isolated()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
