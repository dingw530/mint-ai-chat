package com.mint.server.chat;

import com.mint.server.chat.dto.ChatRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;
import reactor.core.publisher.Flux;

/** HTTP SSE endpoint compatible with the existing POST messages contract. */
@RestController
@RequestMapping("/api/conversations")
public class ChatController {
    private final ChatService service;

    /** Creates the chat controller. */
    public ChatController(ChatService service) {
        this.service = service;
    }

    /** Streams a text response for a conversation. */
    @PostMapping(value = "/{id}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> send(@PathVariable String id, @RequestBody ChatRequest body,
                                               ServerHttpResponse response) {
        if (body != null && body.getControl() instanceof Map<?, ?> raw
                && "tool_approval".equals(String.valueOf(raw.get("type")))) {
            String approvalId = String.valueOf(raw.get("approvalId"));
            String action = String.valueOf(raw.get("action"));
            if (!"approve".equals(action) && !"deny".equals(action)) {
                throw new IllegalArgumentException("Invalid tool approval action");
            }
            response.getHeaders().setCacheControl(CacheControl.noCache());
            response.getHeaders().set("X-Accel-Buffering", "no");
            response.getHeaders().set("Connection", "keep-alive");
            return service.resumeApproval(id, approvalId, action);
        }
        if (body == null || ((body.getContent() == null || body.getContent().isBlank())
                && !hasFiles(body.getFiles()))) {
            throw new IllegalArgumentException("Content is required");
        }
        response.getHeaders().setCacheControl(CacheControl.noCache());
        response.getHeaders().set("X-Accel-Buffering", "no");
        response.getHeaders().set("Connection", "keep-alive");
        return Flux.concat(Flux.just(ServerSentEvent.<String>builder().comment("connected").build()),
                service.stream(id, body.getContent(), body.getAgent(), Boolean.TRUE.equals(body.getRegenerate()), body.getFiles()));
    }

    private boolean hasFiles(Object files) {
        return files instanceof java.util.Collection<?> collection && !collection.isEmpty();
    }
}
