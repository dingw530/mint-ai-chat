package com.mint.server.agent;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** HTTP API for routing history. */
@RestController
@RequestMapping("/api/routing-logs")
public class RoutingLogController {
    private final RoutingLogRepository repository;

    /** Creates the routing log controller. */
    public RoutingLogController(RoutingLogRepository repository) { this.repository = repository; }

    /** Returns paginated routing decisions. */
    @GetMapping({"", "/"})
    public Map<String, List<Map<String, Object>>> list(
            @RequestParam(required = false) String conversationId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Map.of("logs", repository.findAll(conversationId, page, pageSize));
    }
}
