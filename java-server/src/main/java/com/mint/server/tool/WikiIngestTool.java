package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import com.mint.server.wiki.WikiIngestionService;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Compiles text supplied by the model into Wiki knowledge pages. */
@Component
public class WikiIngestTool implements Tool {
    private final WikiIngestionService ingestion;
    private final ObjectMapper mapper;
    public WikiIngestTool(WikiIngestionService ingestion, ObjectMapper mapper) { this.ingestion=ingestion; this.mapper=mapper; }
    public String name() { return "wiki_ingest"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Compile text into LLM Wiki knowledge pages.", Map.of("type", "object", "properties", Map.of("title", Map.of("type", "string"), "text", Map.of("type", "string")), "required", List.of("title", "text"))); }
    public String execute(Map<String,Object> arguments, String conversationId) { try { String title=String.valueOf(arguments.getOrDefault("title", "Untitled")); String text=String.valueOf(arguments.getOrDefault("text", "")); return mapper.writeValueAsString(ingestion.enqueueText(title,text,conversationId)); } catch(Exception error) { return "Wiki ingest failed: "+error.getMessage(); } }
}
