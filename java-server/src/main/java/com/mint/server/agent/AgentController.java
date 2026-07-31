package com.mint.server.agent;

import com.mint.server.agent.dto.AgentRequest;
import com.mint.server.agent.dto.AgentResponse;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** HTTP endpoints for the existing Agent settings contract. */
@RestController
@RequestMapping("/api/agents")
public class AgentController {
    private final AgentService service;

    /** Creates an Agent controller. */
    public AgentController(AgentService service) { this.service = service; }

    /** Lists Agents. */
    @GetMapping({"", "/"}) public Map<String, List<AgentResponse>> list() { return Map.of("agents", service.list()); }
    /** Gets one Agent. */
    @GetMapping("/{id}") public Map<String, AgentResponse> get(@PathVariable String id) {
        return Map.of("agent", service.list().stream().filter(agent -> id.equals(agent.getId())).findFirst()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Agent not found")));
    }
    /** Creates an Agent. */
    @PostMapping({"", "/"}) public Map<String, AgentResponse> create(@RequestBody AgentRequest body) { return Map.of("agent", service.create(body)); }
    /** Updates an Agent. */
    @PutMapping("/{id}") public Map<String, AgentResponse> update(@PathVariable String id, @RequestBody AgentRequest body) { return Map.of("agent", service.update(id, body)); }
    /** Deletes an Agent. */
    @DeleteMapping("/{id}") public Map<String, Boolean> delete(@PathVariable String id) { service.delete(id); return Map.of("success", true); }
}
