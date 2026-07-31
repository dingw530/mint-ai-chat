package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import java.util.List;
import java.util.Map;
import com.mint.server.memory.MemoryRepository;
import org.springframework.stereotype.Component;

/** Retrieves active memories for the current ReAct context. */
@Component
public class MemorySearchTool implements Tool {
    private final MemoryRepository repository;

    /** Creates the memory search tool. */
    public MemorySearchTool(MemoryRepository repository) { this.repository = repository; }
    @Override public String name() { return "memory_search"; }
    @Override public ToolDefinition definition() {
        return new ToolDefinition(name(), "Search saved memories relevant to the query.",
                Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string")), "required", List.of("query")));
    }
    @Override public String execute(Map<String, Object> arguments, String conversationId) {
        String query = String.valueOf(arguments.getOrDefault("query", "")).trim();
        if (query.isEmpty()) return "query is required";
        return repository.search(query).stream().map(row -> "[" + row.get("category") + "] " + row.get("content"))
                .reduce((left, right) -> left + "\n" + right).orElse("No matching memories");
    }
}
