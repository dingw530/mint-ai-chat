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

/** OpenAI Responses API streaming adapter. */
@Component
public class OpenAiResponsesAdapter extends AbstractSseAiAdapter {
    /** Creates the Responses adapter. */
    public OpenAiResponsesAdapter(WebClient.Builder builder, ObjectMapper mapper) {
        super(builder, mapper);
    }

    @Override
    public String apiType() {
        return "openai-responses";
    }

    @Override
    public Flux<AiChunk> stream(ModelEndpoint endpoint, String apiKey, List<ChatMessage> history,
                                String systemPrompt, List<ToolDefinition> tools) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", endpoint.modelId());
        body.put("input", chatMessages(history, null));
        body.put("stream", true);
        if (systemPrompt != null && !systemPrompt.isBlank()) body.put("instructions", systemPrompt);
        if (!tools.isEmpty()) body.put("tools", tools.stream().map(tool -> Map.of("type", "function",
                "name", tool.name(), "description", tool.description() == null ? "" : tool.description(),
                "parameters", tool.parameters() == null ? Map.of() : tool.parameters())).toList());
        return request(endpoint, apiKey, history, systemPrompt, "/v1/responses", body);
    }

    @Override
    protected void applyHeaders(HttpHeaders headers, String apiKey) {
        headers.setBearerAuth(apiKey);
    }

    @Override
    protected AiChunk parseJson(JsonNode json) {
        String type = json.path("type").asText("");
        if ("response.output_text.delta".equals(type)) return AiChunk.text(json.path("delta").asText(""));
        if ("response.output_item.added".equals(type)) {
            JsonNode item = json.path("item");
            if ("function_call".equals(item.path("type").asText(""))) {
                return AiChunk.tool(new ToolCallDelta(json.path("output_index").asInt(0),
                        item.path("id").asText(null), item.path("name").asText(null), ""));
            }
        }
        if ("response.function_call_arguments.delta".equals(type)) {
            return AiChunk.tool(new ToolCallDelta(json.path("output_index").asInt(0),
                    json.path("item_id").asText(null), null, json.path("delta").asText("")));
        }
        if ("response.completed".equals(type)) {
            JsonNode usage = json.path("response").path("usage");
            return AiChunk.terminal(usage.has("input_tokens") ? usage.path("input_tokens").asInt() : null,
                    usage.has("output_tokens") ? usage.path("output_tokens").asInt() : null);
        }
        return null;
    }
}
