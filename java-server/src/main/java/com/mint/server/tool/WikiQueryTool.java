package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import com.mint.server.wiki.WikiRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Returns bounded Wiki evidence for a natural-language query. */
@Component
public class WikiQueryTool implements Tool {
    private final WikiRepository repository;
    public WikiQueryTool(WikiRepository repository) { this.repository=repository; }
    public String name() { return "wiki_query"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Query the LLM Wiki knowledge base.", Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string")), "required", List.of("query"))); }
    public String execute(Map<String,Object> arguments, String conversationId) { String query=String.valueOf(arguments.getOrDefault("query", "")).trim(); if(query.isEmpty()) return "query is required"; return repository.search(query).toString(); }
}
