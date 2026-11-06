package dev.pumpwatch.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ApiController.class)
@Import(RateLimitFilter.class)
@org.springframework.boot.context.properties.EnableConfigurationProperties(ApiProperties.class)
@TestPropertySource(properties = {"api.burst=2", "api.rate-limit-per-minute=1"})
class RateLimitTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReadRepository repo;
    @MockitoBean SseHub hub;

    @Test
    void tooManyRequestsGetRetryTimeAndNotice() throws Exception {
        mvc.perform(get("/api/v1/flags")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/flags")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/flags"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(header().string(Views.NOTICE_HEADER, Views.NOTICE))
                .andExpect(jsonPath("$.notice").value(Views.NOTICE));
    }

    @Test
    void ipv6AddressesInOneSlash64ShareABucket() {
        org.assertj.core.api.Assertions.assertThat(RateLimitFilter.clientKey("2001:db8:1:2:aaaa::1"))
                .isEqualTo(RateLimitFilter.clientKey("2001:db8:1:2:bbbb::9"))
                .isNotEqualTo(RateLimitFilter.clientKey("2001:db8:1:3::1"));
        org.assertj.core.api.Assertions.assertThat(RateLimitFilter.clientKey("198.51.100.7")).isEqualTo("198.51.100.7");
    }

    @Test
    void responsesAreNotSniffable() throws Exception {
        mvc.perform(get("/api/v1/flags")).andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }
}
