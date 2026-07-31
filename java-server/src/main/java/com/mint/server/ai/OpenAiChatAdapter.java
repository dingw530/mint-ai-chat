package com.mint.server.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.conversation.ConversationRepository.ChatMessage;
import com.mint.server.model.ModelEndpoint;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

/** OpenAI Chat Completions compatible streaming adapter. */
@Component
public class OpenAiChatAdapter extends AbstractSseAiAdapter {
    /** Creates the Chat Completions adapter. */
    public OpenAiChatAdapter(WebClient.Builder builder, ObjectMapper mapper) {
        super(builder, mapper);
    }

    @Override
    public String apiType() {
        return "openai-chat";
    }

    @Override
    public Flux<AiChunk> stream(ModelEndpoint endpoint, String apiKey, List<ChatMessage> history,
                                String systemPrompt, List<ToolDefinition> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", endpoint.modelId());
        body.put("messages", chatMessages(history, systemPrompt));
        body.put("stream", true);
        body.put("stream_options", Map.of("include_usage", true));
        if (!tools.isEmpty()) body.put("tools", tools.stream().map(this::openAiTool).toList());
        return request(endpoint, apiKey, history, systemPrompt, "/v1/chat/completions", body);
    }

    @Override
    protected void applyHeaders(HttpHeaders headers, String apiKey) {
        headers.setBearerAuth(apiKey);
    }

    @Override
    protected AiChunk parseJson(JsonNode json) {
        JsonNode usage = json.get("usage");
        if (usage != null && !usage.isNull()) return AiChunk.usage(usage.path("prompt_tokens").asInt(0), usage.path("completion_tokens").asInt(0));
        JsonNode choice = json.path("choices").path(0).path("delta");
        String content = text(choice, "content");
        String reasoning = text(choice, "reasoning_content");
        if (reasoning == null) reasoning = text(choice, "reasoning");
        if (content != null) return AiChunk.text(content);
        if (reasoning != null) return AiChunk.reasoning(reasoning);
        JsonNode tool = choice.get("tool_calls");
        if (tool != null && tool.isArray() && !tool.isEmpty()) {
            JsonNode first = tool.get(0);
            JsonNode function = first.path("function");
            return AiChunk.tool(new ToolCallDelta(first.path("index").asInt(0), text(first, "id"),
                    text(function, "name"), text(function, "arguments")));
        }
        return json.path("choices").path(0).has("finish_reason") ? AiChunk.terminal(null, null) : null;
    }

    private Map<String, Object> openAiTool(ToolDefinition tool) {
        return Map.of("type", "function", "function", Map.of("name", tool.name(),
                "description", tool.description() == null ? "" : tool.description(),
                "parameters", tool.parameters() == null ? Map.of() : tool.parameters()));
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && !value.isNull() && value.isTextual() && !value.asText().isEmpty()
                ? value.asText() : null;
    }
}
