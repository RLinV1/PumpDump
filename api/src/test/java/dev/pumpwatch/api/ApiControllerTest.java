package dev.pumpwatch.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.pumpwatch.api.Views.FlagView;
import dev.pumpwatch.api.Views.ScoreView;
import dev.pumpwatch.common.Flag;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ApiController.class)
@Import({RateLimitFilter.class, WebConfig.class})
@org.springframework.boot.context.properties.EnableConfigurationProperties(ApiProperties.class)
@TestPropertySource(properties = "api.allowed-origins=https://pumpwatch.example")
class ApiControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReadRepository repo;
    @MockitoBean SseHub hub;

    static final Instant T = Instant.parse("2026-01-01T00:00:00Z");

    static FlagView flag() {
        var evidence = new Flag.Evidence(72.5, "rules-1", List.of(new Flag.Contributor("chatter", 30)), 40, 12,
                new Flag.CatalystCheck(false, T.minusSeconds(3600), T, List.of()));
        return new FlagView(7, "GME", T, evidence);
    }

    @Test
    void watchlistIsLiveByDefaultAndCarriesNotice() throws Exception {
        when(repo.latestScores("live")).thenReturn(List.of(new ScoreView("GME", 55, "rules-1", T, T, Set.of("news"))));
        mvc.perform(get("/api/v1/watchlist"))
                .andExpect(status().isOk())
                .andExpect(header().string(Views.NOTICE_HEADER, Views.NOTICE))
                .andExpect(jsonPath("$.notice").value(Views.NOTICE))
                .andExpect(jsonPath("$.data[0].ticker").value("GME"))
                .andExpect(jsonPath("$.data[0].staleSources[0]").value("news"));
    }

    @Test
    void liveEndpointsNeverReadAReplayRun() throws Exception {
        mvc.perform(get("/api/v1/flags")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/watchlist")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/tickers/GME/timeline")).andExpect(status().isOk());
        verify(repo).recentFlags(eq("live"), anyInt());
        verify(repo).latestScores("live");
        verify(repo).scores(eq("live"), eq("GME"), any(), any());
        verify(repo).flags(eq("live"), eq("GME"), any(), any());
        verify(repo, never()).recentFlags(eq("run-1"), anyInt());
    }

    @Test
    void replayRunOnlyWhenRequested() throws Exception {
        mvc.perform(get("/api/v1/flags?runId=run-1")).andExpect(status().isOk());
        verify(repo).recentFlags("run-1", 20);
        mvc.perform(get("/api/v1/flags?runId=live")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/flags?runId=a/b")).andExpect(status().isBadRequest());
    }

    @Test
    void flagsHaveEvidenceNoticeAndNoRawContent() throws Exception {
        when(repo.recentFlags("live", 20)).thenReturn(List.of(flag()));
        String body = mvc.perform(get("/api/v1/flags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notice").value(Views.NOTICE))
                .andExpect(jsonPath("$.data[0].evidence.topContributors[0].featureGroup").value("chatter"))
                .andReturn().getResponse().getContentAsString().toLowerCase();
        for (String forbidden : List.of("\"text\"", "author", "body", "username", "handle")) {
            org.assertj.core.api.Assertions.assertThat(body).doesNotContain(forbidden);
        }
    }

    @Test
    void limitIsBounded() throws Exception {
        mvc.perform(get("/api/v1/flags?limit=0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/flags?limit=101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/flags?limit=abc")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.notice").value(Views.NOTICE));
        mvc.perform(get("/api/v1/flags?limit=20")).andExpect(status().isOk());
    }

    @Test
    void tickerPathIsValidated() throws Exception {
        for (String bad : List.of("gme", "TOOLONG", "G1", "G.M")) {
            mvc.perform(get("/api/v1/tickers/" + bad + "/timeline")).andExpect(status().isBadRequest())
                    .andExpect(header().string(Views.NOTICE_HEADER, Views.NOTICE));
        }
        mvc.perform(get("/api/v1/tickers/GME/timeline")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ticker").value("GME"));
    }

    @Test
    void timelineRangeIsValidated() throws Exception {
        mvc.perform(get("/api/v1/tickers/GME/timeline?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/tickers/GME/timeline?from=2026-01-01T00:00:00Z&to=2026-01-05T00:00:00Z"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void streamRejectsNonNumericLastEventId() throws Exception {
        mvc.perform(get("/api/v1/flags/stream").header("Last-Event-ID", "abc")).andExpect(status().isBadRequest());
    }

    @Test
    void corsAllowsOnlyConfiguredOrigins() throws Exception {
        mvc.perform(get("/api/v1/flags").header("Origin", "https://pumpwatch.example"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://pumpwatch.example"));
        mvc.perform(get("/api/v1/flags").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden());
    }

    @Test
    void isReadOnly() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/flags"))
                .andExpect(status().isMethodNotAllowed());
        mvc.perform(get("/api/v1/watchlist")).andExpect(content().contentTypeCompatibleWith("application/json"));
    }
}
