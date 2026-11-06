package dev.pumpwatch.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(classes = ProxyRateLimitTest.Config.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"api.burst=1", "api.rate-limit-per-minute=1"})
class ProxyRateLimitTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, FlywayAutoConfiguration.class, KafkaAutoConfiguration.class})
    @EnableConfigurationProperties(ApiProperties.class)
    @Import({ApiController.class, RateLimitFilter.class})
    static class Config {}

    @Value("${local.server.port}") int port;
    @MockitoBean ReadRepository repo;
    @MockitoBean SseHub hub;

    @Test
    void trustedProxyClientsHaveSeparateBuckets() throws Exception {
        assertThat(request("127.0.0.1", "198.51.100.1")).contains(" 200 ");
        assertThat(request("127.0.0.1", "198.51.100.2")).contains(" 200 ");
        assertThat(request("127.0.0.1", "198.51.100.1")).contains(" 429 ");
    }

    @Test
    void untrustedPeerCannotRotateForwardingHeadersToEvadeLimit() throws Exception {
        assertThat(request("127.0.0.2", "198.51.100.3")).contains(" 200 ");
        assertThat(request("127.0.0.2", "198.51.100.4")).contains(" 429 ");
    }

    private String request(String peer, String forwarded) throws Exception {
        try (var socket = new Socket()) {
            socket.bind(new InetSocketAddress(peer, 0));
            socket.connect(new InetSocketAddress("127.0.0.1", port), 3000);
            socket.setSoTimeout(3000);
            socket.getOutputStream().write(("GET /api/v1/watchlist HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-For: "
                    + forwarded + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            return new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII)).readLine();
        }
    }
}
