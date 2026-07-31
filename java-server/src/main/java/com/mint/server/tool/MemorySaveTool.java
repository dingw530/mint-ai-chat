package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.mint.server.memory.MemoryRepository;
import org.springframework.stereotype.Component;

/** Saves an explicit memory from a ReAct tool call. */
@Component
public class MemorySaveTool implements Tool {
    private final MemoryRepository repository;

    /** Creates the memory save tool. */
    public MemorySaveTool(MemoryRepository repository) { this.repository = repository; }
    @Override public String name() { return "memory_save"; }
    @Override public ToolDefinition definition() {
        return new ToolDefinition(name(), "Save a durable user memory when explicitly requested.",
                Map.of("type", "object", "properties", Map.of("content", Map.of("type", "string"), "category", Map.of("type", "string")), "required", List.of("content")));
    }
    @Override public String execute(Map<String, Object> arguments, String conversationId) {
        String content = String.valueOf(arguments.getOrDefault("content", "")).trim();
        if (content.isEmpty()) return "content is required";
        String now = Instant.now().toString();
        repository.saveToolMemory(UUID.randomUUID().toString(), content, String.valueOf(arguments.getOrDefault("category", "general")), conversationId, now);
        return "Memory saved";
    }
}
