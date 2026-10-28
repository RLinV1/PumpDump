package dev.pumpwatch.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final ApiProperties props;

    public WebConfig(ApiProperties props) {
        this.props = props;
    }

    /** Read-only API: GET only, and only the configured origins (none configured means no cross-origin access). */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET")
                .exposedHeaders(Views.NOTICE_HEADER, "Retry-After");
    }
}
