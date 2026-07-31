package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import java.util.List;
import java.util.Map;
import com.mint.server.wiki.WikiRepository;
import org.springframework.stereotype.Component;

/** Searches the existing SQLite FTS Wiki index and returns bounded evidence. */
@Component
public class WikiSearchTool implements Tool {
    private final WikiRepository repository;
    private final ObjectMapper mapper;

    /** Creates the Wiki search tool. */
    public WikiSearchTool(WikiRepository repository, ObjectMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return "wiki_search";
    }

    @Override
    public ToolDefinition definition() {
        return new ToolDefinition(name(), "Search the Wiki knowledge base for evidence.",
                Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string")),
                        "required", List.of("query")));
    }

    @Override
    public String execute(Map<String, Object> arguments, String conversationId) {
        String query = String.valueOf(arguments.getOrDefault("query", "")).trim();
        if (query.isEmpty()) return "query is required";
        try {
            List<Map<String,Object>> results = repository.search(query).stream().map(row -> {
                Map<String,Object> result = new java.util.LinkedHashMap<>();
                String file = String.valueOf(row.getOrDefault("source_path", ""));
                result.put("file", file); result.put("title", row.getOrDefault("title", file));
                result.put("heading", row.getOrDefault("heading", "")); result.put("snippet", row.getOrDefault("body", ""));
                result.put("chunkId", file + "#0"); result.put("score", 1.0); return result;
            }).toList();
            return mapper.writeValueAsString(Map.of("results", results));
        } catch (Exception error) {
            return "Wiki search failed: " + error.getMessage();
        }
    }
}
