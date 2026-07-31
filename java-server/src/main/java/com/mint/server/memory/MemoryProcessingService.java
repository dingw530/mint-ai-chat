package com.mint.server.memory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.AiAdapterRegistry;
import com.mint.server.ai.AiChunk;
import com.mint.server.conversation.ConversationRepository;
import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Runs the persistent Node-compatible post-conversation memory extraction queue. */
@Service
public class MemoryProcessingService {
    private static final String PROMPT = "Extract durable user memories from this conversation. Return only a JSON array of objects with "
            + "content and category fields. Ignore temporary requests, assistant facts, and sensitive secrets. Return [] if none.";
    private final MemoryRepository memories;
    private final ConversationRepository conversations;
    private final ModelEndpointRepository endpoints;
    private final EncryptionService encryption;
    private final AiAdapterRegistry adapters;
    private final ObjectMapper mapper;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean scheduled = new AtomicBoolean();

    @Autowired
    public MemoryProcessingService(MemoryRepository memories, ConversationRepository conversations,
                                   ModelEndpointRepository endpoints, EncryptionService encryption,
                                   AiAdapterRegistry adapters, ObjectMapper mapper) {
        this.memories = memories;
        this.conversations = conversations;
        this.endpoints = endpoints;
        this.encryption = encryption;
        this.adapters = adapters;

        this.mapper = mapper;
        executor.submit(this::drain);
    }

    /** Adds a conversation to the durable queue and wakes the worker. */
    public void enqueue(String conversationId) {
        memories.enqueueProcessing(conversationId);
        schedule();
    }

    private void schedule() {
        if (scheduled.compareAndSet(false, true)) executor.submit(() -> {
            try { drain(); } finally { scheduled.set(false); }
        });
    }

    private void drain() {
        Map<String,Object> job;
        while ((job = memories.nextProcessing().orElse(null)) != null) {
            String id = String.valueOf(job.get("id"));
            try {
                extract(String.valueOf(job.get("conversation_id")));
                memories.completeProcessing(id);
            } catch (Exception error) {
                memories.failProcessing(id, error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
            }
        }
    }

    private void extract(String conversationId) {
        List<ConversationRepository.ChatMessage> history = conversations.findHistory(conversationId);
        String users = history.stream().filter(item -> "user".equals(item.role())).map(ConversationRepository.ChatMessage::content).reduce("", (a,b) -> a + "\n" + b);
        String assistants = history.stream().filter(item -> "assistant".equals(item.role())).map(ConversationRepository.ChatMessage::content).reduce("", (a,b) -> a + "\n" + b);
        if (users.isBlank() || assistants.isBlank()) return;
        ModelEndpoint endpoint = endpoints.activeText().orElse(null);
        if (endpoint == null) return;
        String key = endpoint.encryptedApiKey();
        if (key != null && key.contains(":")) key = encryption.decrypt(key);
        List<ConversationRepository.ChatMessage> prompt = List.of(
                new ConversationRepository.ChatMessage("user", "User messages:\n" + users + "\n\nAssistant messages:\n" + assistants, null, List.of(), null));
        String output = adapters.stream(endpoint, key == null ? "" : key, prompt, PROMPT, List.of())
                .map(AiChunk::content).filter(value -> value != null).reduce("", String::concat).block(Duration.ofMinutes(2));
        if (output == null || output.isBlank()) return;
        for (Map<String,Object> memory : parse(output)) {
            Object content = memory.get("content");
            if (content == null || String.valueOf(content).isBlank()) continue;
            memories.insert(UUID.randomUUID().toString(), String.valueOf(content).trim(),
                    String.valueOf(memory.getOrDefault("category", "general")), conversationId, Instant.now().toString());
        }
    }

    private List<Map<String,Object>> parse(String output) {
        String json = output.trim();
        int start = json.indexOf('['), end = json.lastIndexOf(']');
        if (start >= 0 && end > start) json = json.substring(start, end + 1);
        try { return mapper.readValue(json, new TypeReference<>() {}); }
        catch (Exception ignored) { return new ArrayList<>(); }
    }
}
