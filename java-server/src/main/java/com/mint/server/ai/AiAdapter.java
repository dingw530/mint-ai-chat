package com.mint.server.ai;

import com.mint.server.model.ModelEndpoint;
import com.mint.server.conversation.ConversationRepository.ChatMessage;
import java.util.List;
import reactor.core.publisher.Flux;

/** Provider-neutral streaming adapter contract. */
public interface AiAdapter {
    /** Returns the persisted api_type handled by this adapter. */
    String apiType();

    /** Streams normalized text/reasoning/terminal events. */
    Flux<AiChunk> stream(ModelEndpoint endpoint, String apiKey, List<ChatMessage> history,
                         String systemPrompt, List<ToolDefinition> tools);
}
