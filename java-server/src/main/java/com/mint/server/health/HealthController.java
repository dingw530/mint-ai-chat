package com.mint.server.health;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exposes a lightweight health contract for local Docker orchestration. */
@RestController
@RequestMapping("/api")
public class HealthController {

    /** Returns service readiness without touching model providers. */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "mint-java-server");
    }
}
