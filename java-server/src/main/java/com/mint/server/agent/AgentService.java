package com.mint.server.agent;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.agent.dto.AgentRequest;
import com.mint.server.agent.dto.AgentResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Application service for the existing Agent settings contract. */
@Service
public class AgentService {
    private final AgentRepository repository;
    private final ObjectMapper mapper;

    /** Creates an Agent service backed by the existing SQLite table. */
    public AgentService(AgentRepository repository, ObjectMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    /** Lists all Agents in creation order. */
    public List<AgentResponse> list() {
        return repository.findAll();
    }

    /** Creates one configurable Agent. */
    public AgentResponse create(AgentRequest input) {
        String name = required(input.getName(), "name");
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        repository.insert(id, name, value(input.getDescription()), value(input.getType(), "custom"), input.getSystemPrompt(), Boolean.TRUE.equals(input.getAvailable()), jsonList(input.getMcpServerIds()), jsonList(input.getTriggerKeywords()), now);
        return find(id);
    }

    /** Updates editable Agent fields while preserving the built-in Agent type. */
    public AgentResponse update(String id, AgentRequest input) {
        AgentResponse existing = find(id);
        String type = "general".equals(existing.getType()) ? "general" : value(input.getType(), "custom");
        repository.update(id, value(input.getName(), existing.getName()), value(input.getDescription(), existing.getDescription()), type,
                input.getSystemPrompt() == null ? existing.getSystemPrompt() : input.getSystemPrompt(), Boolean.TRUE.equals(input.getAvailable()),
                jsonList(input.getMcpServerIds()), jsonList(input.getTriggerKeywords()), Instant.now().toString());
        return find(id);
    }

    /** Deletes a non-built-in Agent. */
    public void delete(String id) {
        AgentResponse existing = find(id);
        if ("general".equals(existing.getType())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete built-in agent");
        repository.delete(id);
    }

    private AgentResponse find(String id) {
        return list().stream().filter(agent -> id.equals(agent.getId())).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found"));
    }

    private String required(String value, String key) {
        if (value == null || value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        return value.trim();
    }

    private String value(String value) { return value == null ? "" : value; }
    private String value(String value, String fallback) { return value == null ? fallback : value; }

    private String jsonList(List<String> value) {
        try { return mapper.writeValueAsString(value == null ? List.of() : value); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("Invalid list value", error); }
    }

    private List<String> parseList(String value) {
        try { return mapper.readValue(value == null ? "[]" : value, new TypeReference<>() {}); }
        catch (JsonProcessingException error) { return List.of(); }
    }
}
