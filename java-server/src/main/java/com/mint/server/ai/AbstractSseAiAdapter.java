package com.mint.server.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.conversation.ConversationRepository.ChatMessage;
import com.mint.server.model.ModelEndpoint;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

/** Shared WebClient/SSE transport for OpenAI-compatible and Anthropic APIs. */
public abstract class AbstractSseAiAdapter implements AiAdapter {
    protected final WebClient webClient;
    protected final ObjectMapper mapper;

    /** Creates an adapter with Spring's non-blocking HTTP client. */
    protected AbstractSseAiAdapter(WebClient.Builder builder, ObjectMapper mapper) {
        this.webClient = builder.build();
        this.mapper = mapper;
    }

    /** Builds and sends the provider request, then parses data lines. */
    protected Flux<AiChunk> request(ModelEndpoint endpoint, String apiKey,
                                    List<ChatMessage> history, String systemPrompt,
                                    String path, Map<String, Object> body) {
        return webClient.post()
                .uri(normalizeUrl(endpoint.apiUrl(), path))
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .headers(headers -> applyHeaders(headers, apiKey))
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                .timeout(Duration.ofMinutes(3))
                .mapNotNull(ServerSentEvent::data)
                .flatMapIterable(this::dataLines)
                .map(this::parseData)
                .filter(chunk -> chunk != null);
    }

    /** Adds provider-specific authentication headers. */
    protected abstract void applyHeaders(org.springframework.http.HttpHeaders headers, String apiKey);

    /** Parses one provider data line. */
    protected abstract AiChunk parseJson(JsonNode json);

    /** Converts an arbitrary WebClient chunk into SSE data payloads. */
    private List<String> dataLines(String chunk) {
        List<String> result = new ArrayList<>();
        for (String line : chunk.split("\\r?\\n")) {
            if (line.startsWith("data:")) {
                String data = line.substring(5).trim();
                if (!data.isEmpty()) result.add(data);
            }
        }
        // WebClient may decode text/event-stream data fields and omit the data: prefix.
        if (result.isEmpty() && !chunk.isBlank() && !chunk.startsWith("event:")) {
            result.add(chunk.trim());
        }
        return result;
    }

    private AiChunk parseData(String data) {
        if ("[DONE]".equals(data)) return AiChunk.terminal(null, null);
        try {
            return parseJson(mapper.readTree(data));
        } catch (Exception ignored) {
            return null;
        }
    }

    /** Creates the common OpenAI chat message payload. */
    protected List<Map<String, Object>> chatMessages(List<ChatMessage> history, String systemPrompt) {
        List<Map<String, Object>> messages = new ArrayList<>();
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            messages.add(Map.of("role", "system", "content", systemPrompt));
        }
        for (ChatMessage message : history) {
            Map<String, Object> item = new HashMap<>();
            item.put("role", message.role());
            item.put("content", message.content());
            if (!message.toolCalls().isEmpty()) {
                item.put("tool_calls", message.toolCalls().stream().map(call -> Map.of(
                        "id", call.id(), "type", "function", "function", Map.of(
                                "name", call.name(), "arguments", call.arguments()))).toList());
            }
            if (message.toolCallId() != null) item.put("tool_call_id", message.toolCallId());
            messages.add(item);
        }
        return messages;
    }

    private String normalizeUrl(String base, String path) {
        String normalized = base.replaceAll("/+\\z", "");
        return normalized.endsWith(path) ? normalized : normalized + path;
    }
}
