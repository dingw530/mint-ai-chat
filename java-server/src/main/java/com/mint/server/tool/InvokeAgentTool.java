package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.agent.AgentService;
import com.mint.server.agent.dto.AgentResponse;
import com.mint.server.ai.AiAdapterRegistry;
import com.mint.server.ai.AiChunk;
import com.mint.server.conversation.ConversationRepository;
import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Delegates a bounded, tool-free subtask to a configured worker Agent. */
@Component
public class InvokeAgentTool implements Tool {
    private final AgentService agents;
    private final ModelEndpointRepository endpoints;
    private final EncryptionService encryption;
    private final AiAdapterRegistry adapters;
    private final ObjectMapper mapper;
    public InvokeAgentTool(AgentService agents, ModelEndpointRepository endpoints, EncryptionService encryption,
                           AiAdapterRegistry adapters, ObjectMapper mapper) { this.agents=agents; this.endpoints=endpoints; this.encryption=encryption; this.adapters=adapters; this.mapper=mapper; }
    public String name() { return "invoke_agent"; }
    public com.mint.server.ai.ToolDefinition definition() { return new com.mint.server.ai.ToolDefinition(name(), "Delegate a task to a configured worker Agent.", Map.of("type","object","properties",Map.of("agent_id",Map.of("type","string"),"task",Map.of("type","string"),"timeout_ms",Map.of("type","integer"),"inherit_context",Map.of("type","boolean")),"required",List.of("agent_id","task"))); }
    public String execute(Map<String,Object> input, String conversationId) {
        long started = System.currentTimeMillis(); String agentId=String.valueOf(input.getOrDefault("agent_id", "")); String task=String.valueOf(input.getOrDefault("task", ""));
        AgentResponse agent=agents.list().stream().filter(item -> agentId.equals(item.getId())).findFirst().orElse(null);
        if (agent == null) return result(false, "", agentId, task, "Agent not found", started, 0, 0);
        if (!agent.isAvailable()) return result(false, "", agentId, task, "Agent is not available", started, 0, 0);
        ModelEndpoint endpoint=endpoints.activeText().orElse(null); if (endpoint == null) return result(false,"",agentId,task,"AI API not configured",started,0,0);
        String key=endpoint.getEncryptedApiKey(); if(key!=null&&key.contains(":")) key=encryption.decrypt(key);
        try {
            String content=adapters.stream(endpoint,key==null?"":key,List.of(new ConversationRepository.ChatMessage("user",task,null,List.of(),null)),agent.getSystemPrompt(),List.of())
                    .map(AiChunk::content).filter(value -> value != null).reduce("",String::concat).block(Duration.ofMillis(timeout(input)));
            return result(true,content==null?"":content,agentId,task,null,started,0,1);
        } catch(Exception error) { return result(false,"",agentId,task,"Agent execution failed: "+error.getMessage(),started,0,0); }
    }
    private long timeout(Map<String,Object> input) { try { return Math.max(5000,Math.min(120000,Long.parseLong(String.valueOf(input.getOrDefault("timeout_ms",60000))))); } catch(Exception ignored) { return 60000; } }
    private String result(boolean success,String content,String agentId,String task,String error,long started,int calls,int iterations) { try { Map<String,Object> value=new java.util.LinkedHashMap<>(); value.put("success",success);value.put("content",content);value.put("agentId",agentId);value.put("task",task);if(error!=null)value.put("error",error);value.put("duration",System.currentTimeMillis()-started);value.put("toolCalls",calls);value.put("iterations",iterations);return mapper.writeValueAsString(value); } catch(Exception ex) { return "invoke_agent failed: "+ex.getMessage(); } }
}
