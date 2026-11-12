package dev.pumpwatch.connectors;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ConnectorsApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConnectorsApplication.class, args);
    }
}
