package dev.pumpwatch.replay;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ReplayController.class)
class ReplayControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean Replayer replayer;

    @Test
    void returnsRunId() throws Exception {
        when(replayer.start(any(), any(), anyDouble(), anyBoolean())).thenReturn("run-42");
        mvc.perform(post("/replays").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"2026-01-01T00:00:00Z\",\"to\":\"2026-01-01T01:00:00Z\","
                                + "\"speed\":10,\"isolated\":true}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.runId").value("run-42"));
    }

    @Test
    void badRangeIs400() throws Exception {
        when(replayer.start(any(), any(), anyDouble(), anyBoolean()))
                .thenThrow(new IllegalArgumentException("from must be before to"));
        mvc.perform(post("/replays").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"2026-01-01T01:00:00Z\",\"to\":\"2026-01-01T00:00:00Z\"}"))
                .andExpect(status().isBadRequest());
    }
}
