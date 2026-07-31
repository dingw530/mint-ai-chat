package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.graph.GraphRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Exposes bounded knowledge graph lookup and mutation to ReAct. */
@Component
public class KnowledgeGraphTool implements Tool {
    private final GraphRepository repository;
    private final ObjectMapper mapper;
    public KnowledgeGraphTool(GraphRepository repository,ObjectMapper mapper){this.repository=repository;this.mapper=mapper;}
    public String name(){return "knowledge_graph";}
    public ToolDefinition definition(){return new ToolDefinition(name(),"Search the LLM Wiki knowledge graph.",Map.of("type","object","properties",Map.of("query",Map.of("type","string")),"required",List.of("query")));}
    public String execute(Map<String,Object> arguments,String conversationId){try{String query=String.valueOf(arguments.getOrDefault("query",""));return mapper.writeValueAsString(repository.search(query));}catch(Exception error){return "Knowledge graph failed: "+error.getMessage();}}
}
