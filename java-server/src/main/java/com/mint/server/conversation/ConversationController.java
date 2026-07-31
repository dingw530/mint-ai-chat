package com.mint.server.conversation;

import com.mint.server.conversation.dto.ConversationCreateRequest;
import com.mint.server.conversation.dto.ConversationPatchRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Duration;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.wiki.WikiService;

/** HTTP endpoints compatible with the existing conversations API. */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {
    private final ConversationService service;
    private final WikiService wiki;
    private final ObjectMapper mapper;

    /** Creates a controller backed by the conversation service. */
    public ConversationController(ConversationService service, WikiService wiki, ObjectMapper mapper) {
        this.service = service;
        this.wiki = wiki;
        this.mapper = mapper;
    }

    /** Lists conversations. */
    @GetMapping({"", "/"})
    public Map<String, List<Conversation>> list(@RequestParam(required = false) String type) {
        return Map.of("conversations", service.list(type));
    }

    /** Creates a conversation. */
    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Conversation> create(@RequestBody(required = false) ConversationCreateRequest body) {
        ConversationCreateRequest request = body == null ? new ConversationCreateRequest() : body;
        return Map.of("conversation", service.create(request.getTitle(), request.getType()));
    }

    /** Gets messages for one conversation. */
    @GetMapping("/{id}/messages")
    public Map<String, List<Message>> messages(@PathVariable String id) {
        return Map.of("messages", service.messages(id));
    }

    /** Opens the compatible ingestion-event stream; Java upload jobs are persisted and polled separately. */
    @GetMapping(value = "/{id}/ingestion-events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> ingestionEvents(@PathVariable String id) {
        service.messages(id);
        Flux<ServerSentEvent<String>> updates = Flux.interval(Duration.ZERO, Duration.ofSeconds(1))
                .flatMap(ignored -> Mono.justOrEmpty(wiki.jobs("", 100).get("jobs")))
                .flatMapIterable(value -> value instanceof List<?> list ? list : List.of())
                .filter(value -> value instanceof Map<?,?> map && id.equals(String.valueOf(map.get("conversationId"))))
                .flatMap(value -> events(value));
        return Flux.concat(Flux.just(ServerSentEvent.<String>builder().comment("connected").build()), updates);
    }

    private Flux<ServerSentEvent<String>> events(Object value) {
        if (!(value instanceof Map<?,?> raw)) return Flux.empty();
        Map<String,Object> job = new java.util.LinkedHashMap<>(); raw.forEach((key,item) -> job.put(String.valueOf(key), item));
        String jobId = String.valueOf(job.get("id"));
        String surface = "ingestion-task-" + jobId;
        Map<String,Object> source = new java.util.LinkedHashMap<>(); source.put("jobId", jobId); source.put("title", job.get("fileName"));
        source.put("status", job.get("status")); source.put("statusLabel", job.get("step")); source.put("progress", job.get("progress"));
        source.put("step", job.get("step")); source.put("fileCount", job.getOrDefault("fileCount", 1));
        Map<String,Object> create = Map.of("version", "v0.9", "createSurface", Map.of("surfaceId", surface, "catalogId", "mint"));
        Map<String,Object> components = Map.of("version", "v0.9", "updateComponents", Map.of("surfaceId", surface,
                "components", List.of(Map.of("id", "root", "component", "IngestionTaskCard", "data", Map.of("path", "/job")))));
        Map<String,Object> data = Map.of("version", "v0.9", "updateDataModel", Map.of("surfaceId", surface, "path", "/job", "value", source));
        return Flux.just(create, components, data).map(this::sse);
    }

    private ServerSentEvent<String> sse(Object value) {
        try { return ServerSentEvent.<String>builder(mapper.writeValueAsString(value)).build(); }
        catch (Exception error) { return ServerSentEvent.<String>builder("{}").build(); }
    }

    /** Generates a compatible title after the first assistant response. */
    @PostMapping("/{id}/generate-title")
    public Map<String, String> generateTitle(@PathVariable String id) {
        return Map.of("title", service.generateTitle(id));
    }

    /** Renames or changes the locked agent for one conversation. */
    @PatchMapping("/{id}")
    public Map<String, Conversation> patch(@PathVariable String id, @RequestBody ConversationPatchRequest body) {
        Conversation conversation = body.lockedAgentPresent()
                ? service.lockAgent(id, body.getLockedAgent())
                : service.rename(id, body.getTitle());
        return Map.of("conversation", conversation);
    }

    /** Deletes one conversation. */
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        service.delete(id);
        return Map.of("success", true);
    }

    /** Deletes all conversations. */
    @DeleteMapping({"", "/"})
    public Map<String, Integer> deleteAll() {
        return Map.of("changes", service.deleteAll());
    }

}
