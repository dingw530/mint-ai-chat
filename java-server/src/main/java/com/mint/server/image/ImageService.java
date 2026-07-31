package com.mint.server.image;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.conversation.Conversation;
import com.mint.server.conversation.ConversationRepository;
import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

/** Generates images through an OpenAI-compatible image endpoint. */
@Service
public class ImageService {
    private final ModelEndpointRepository endpoints;
    private final ConversationRepository conversations;
    private final EncryptionService encryption;
    private final ObjectMapper mapper;
    private final WebClient.Builder clientBuilder;

    /** Creates the image service. */
    public ImageService(ModelEndpointRepository endpoints, ConversationRepository conversations,
                        EncryptionService encryption, ObjectMapper mapper, WebClient.Builder clientBuilder) {
        this.endpoints = endpoints;
        this.conversations = conversations;
        this.encryption = encryption;
        this.mapper = mapper;
        this.clientBuilder = clientBuilder;
    }

    /** Generates one image and returns the upstream response shape. */
    public Map<String, Object> generate(String endpointId, String prompt, String size, String quality, String outputFormat) {
        if (prompt == null || prompt.isBlank()) throw bad("prompt 不能为空");
        ModelEndpoint endpoint = endpoints.findById(endpointId).orElseThrow(() -> notFound("端点不存在"));
        if (!"image".equals(endpoint.getCategory())) throw bad("该端点不是图片模型");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", endpoint.getModelId());
        body.put("prompt", prompt.trim());
        body.put("n", 1);
        if (size != null && !size.isBlank()) body.put("size", size);
        if (quality != null && !quality.isBlank()) body.put("quality", quality);
        if (outputFormat != null && !outputFormat.isBlank()) body.put("output_format", outputFormat);
        String key = endpoint.getEncryptedApiKey() == null ? "" : encryption.decrypt(endpoint.getEncryptedApiKey());
        try {
            String response = clientBuilder.build().post().uri(normalize(endpoint.getApiUrl(), "/v1/images/generations"))
                    .headers(headers -> headers.setBearerAuth(key)).bodyValue(body).retrieve().bodyToMono(String.class).block();
            return mapper.readValue(response == null ? "{}" : response, new com.fasterxml.jackson.core.type.TypeReference<>() {});
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, upstreamMessage(error), error);
        }
    }

    /** Generates and persists the two messages for an image conversation. */
    public Map<String, Object> sendMessage(String conversationId, String endpointId, String prompt,
                                           String size, String quality, String outputFormat) {
        Conversation conversation = conversations.findById(conversationId).orElseThrow(() -> notFound("对话不存在"));
        if (!"image".equals(conversation.getType())) throw bad("该对话不是图片对话");
        conversations.insertMessage(conversationId, "user", prompt, null, null);
        Map<String, Object> result = generate(endpointId, prompt, size, quality, outputFormat);
        try {
            conversations.insertMessage(conversationId, "assistant", "", null,
                    mapper.writeValueAsString(result.get("data")));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Unable to persist generated image", error);
        }
        var messages = conversations.findMessages(conversationId);
        return Map.of("userMessage", messages.get(messages.size() - 2), "assistantMessage", messages.get(messages.size() - 1));
    }

    private String upstreamMessage(Exception error) {
        if (error instanceof org.springframework.web.reactive.function.client.WebClientResponseException response) {
            return response.getResponseBodyAsString();
        }
        return error.getMessage() == null ? "图片服务请求失败" : error.getMessage();
    }
    private String normalize(String base, String path) { String value=base.replaceAll("/+\\z", ""); return value.endsWith(path) ? value : value.endsWith("/v1") ? value + path.substring(3) : value + path; }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
