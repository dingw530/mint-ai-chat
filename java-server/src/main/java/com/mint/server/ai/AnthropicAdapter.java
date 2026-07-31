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

/** Anthropic Messages API streaming adapter. */
@Component
public class AnthropicAdapter extends AbstractSseAiAdapter {
    /** Creates the Anthropic adapter. */
    public AnthropicAdapter(WebClient.Builder builder, ObjectMapper mapper) {
        super(builder, mapper);
    }

    @Override
    public String apiType() {
        return "anthropic";
    }

    @Override
    public Flux<AiChunk> stream(ModelEndpoint endpoint, String apiKey, List<ChatMessage> history,
                                String systemPrompt, List<ToolDefinition> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", endpoint.modelId());
        body.put("messages", chatMessages(history, null));
        body.put("max_tokens", 4096);
        body.put("stream", true);
        if (systemPrompt != null && !systemPrompt.isBlank()) body.put("system", systemPrompt);
        if (!tools.isEmpty()) body.put("tools", tools.stream().map(tool -> Map.of("name", tool.name(),
                "description", tool.description() == null ? "" : tool.description(),
                "input_schema", tool.parameters() == null ? Map.of() : tool.parameters())).toList());
        String path = endpoint.apiUrl().replaceAll("/+\\z", "").endsWith("/v1")
                ? "/messages" : "/v1/messages";
        return request(endpoint, apiKey, history, systemPrompt, path, body);
    }

    @Override
    protected void applyHeaders(HttpHeaders headers, String apiKey) {
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", "2023-06-01");
    }

    @Override
    protected AiChunk parseJson(JsonNode json) {
        String type = json.path("type").asText("");
        if ("message_start".equals(type)) {
            JsonNode usage = json.path("message").path("usage");
            if (usage.has("input_tokens")) {
                return AiChunk.usage(usage.path("input_tokens").asInt(), usage.path("output_tokens").asInt(0));
            }
        }
        if ("content_block_delta".equals(type)) {
            JsonNode delta = json.path("delta");
            if ("text_delta".equals(delta.path("type").asText())) return AiChunk.text(delta.path("text").asText(""));
            if ("input_json_delta".equals(delta.path("type").asText())) {
                return AiChunk.tool(new ToolCallDelta(json.path("index").asInt(0), null, null,
                        delta.path("partial_json").asText("")));
            }
        }
        if ("content_block_start".equals(type) && "tool_use".equals(json.path("content_block").path("type").asText())) {
            JsonNode block = json.path("content_block");
            return AiChunk.tool(new ToolCallDelta(json.path("index").asInt(0), block.path("id").asText(null),
                    block.path("name").asText(null), ""));
        }
        if ("message_delta".equals(type)) {
            JsonNode usage = json.path("usage");
            if (usage.has("output_tokens")) return AiChunk.usage(usage.path("input_tokens").asInt(0), usage.path("output_tokens").asInt());
        }
        if ("message_stop".equals(type)) return AiChunk.terminal(null, null);
        return null;
    }
}
