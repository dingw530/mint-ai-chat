package com.mint.server.ai;

import com.mint.server.conversation.ConversationRepository.ChatMessage;
import com.mint.server.model.ModelEndpoint;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/** Selects the provider adapter from the existing api_type field. */
@Component
public class AiAdapterRegistry {
    private final Map<String, AiAdapter> adapters;

    /** Creates a registry from all Spring adapter beans. */
    public AiAdapterRegistry(List<AiAdapter> adapters) {
        this.adapters = adapters.stream().collect(Collectors.toUnmodifiableMap(AiAdapter::apiType, Function.identity()));
    }

    /** Streams through the configured adapter or fails with a clear configuration error. */
    public Flux<AiChunk> stream(ModelEndpoint endpoint, String apiKey, List<ChatMessage> history,
                                String systemPrompt, List<ToolDefinition> tools) {
        AiAdapter adapter = adapters.get(endpoint.apiType());
        if (adapter == null) return Flux.error(new IllegalArgumentException("Unsupported apiType: " + endpoint.apiType()));
        return adapter.stream(endpoint, apiKey, history, systemPrompt, tools);
    }
}
