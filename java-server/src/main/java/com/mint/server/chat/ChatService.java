package com.mint.server.chat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.agent.AiRunGate;
import com.mint.server.agent.RoutingService;
import com.mint.server.agent.dto.AgentResponse;
import com.mint.server.ai.AiAdapterRegistry;
import com.mint.server.ai.AiChunk;
import com.mint.server.ai.ToolCall;
import com.mint.server.ai.ToolCallDelta;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.conversation.Conversation;
import com.mint.server.conversation.ConversationRepository;
import com.mint.server.conversation.UiBlock;
import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import com.mint.server.tool.ToolRegistry;
import com.mint.server.tool.Tool;
import com.mint.server.tool.ToolApprovalStore;
import com.mint.server.token.TokenUsageRepository;
import com.mint.server.memory.MemoryRepository;
import com.mint.server.memory.MemoryProcessingService;
import com.mint.server.settings.SettingsService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

/** Coordinates persisted messages, bounded ReAct rounds, tools and compatible SSE events. */
@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private final ConversationRepository conversations;
    private final ModelEndpointRepository endpoints;
    private final EncryptionService encryption;
    private final AiAdapterRegistry adapters;
    private final ToolRegistry tools;
    private final AiRunGate gate;
    private final ObjectMapper mapper;
    private final TokenUsageRepository tokenUsage;
    private final SettingsService settings;
    private final RoutingService routing;
    private final ToolApprovalStore approvals;
    private final MemoryRepository memories;
    private final MemoryProcessingService memoryProcessing;

    /** Creates the chat service. */
    public ChatService(ConversationRepository conversations, ModelEndpointRepository endpoints,
                       EncryptionService encryption, AiAdapterRegistry adapters, ToolRegistry tools,
                       AiRunGate gate, ObjectMapper mapper, TokenUsageRepository tokenUsage,
                       SettingsService settings, RoutingService routing, ToolApprovalStore approvals, MemoryRepository memories,
                       MemoryProcessingService memoryProcessing) {
        this.conversations = conversations;
        this.endpoints = endpoints;
        this.encryption = encryption;
        this.adapters = adapters;
        this.tools = tools;
        this.gate = gate;
        this.mapper = mapper;
        this.tokenUsage = tokenUsage;
        this.settings = settings;
        this.routing = routing;
        this.approvals = approvals;
        this.memories = memories;
        this.memoryProcessing = memoryProcessing;
    }

    /** Starts one compatible text stream for a conversation. */
    public Flux<ServerSentEvent<String>> stream(String conversationId, String content) {
        return stream(conversationId, content, null, false, null);
    }

    /** Starts a stream with the optional Node-compatible agent, regeneration and file inputs. */
    public Flux<ServerSentEvent<String>> stream(String conversationId, String content, String explicitAgent,
                                                boolean regenerate, Object files) {
        if (!gate.tryAcquire(conversationId)) {
            return Flux.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Conversation is already running or AI concurrency limit reached"));
        }
        return Flux.<ServerSentEvent<String>>create(sink -> {
            try {
                run(conversationId, content, explicitAgent, regenerate, files, sink);
            } catch (Exception error) {
                log.error("Chat stream failed for conversation {}", conversationId, error);
                sink.next(failed(UUID.randomUUID().toString(), error));
                sink.complete();
            } finally {
                gate.release(conversationId);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private void run(String conversationId, String content, String explicitAgent, boolean regenerate, Object files,
                     reactor.core.publisher.FluxSink<ServerSentEvent<String>> sink) {
        String runId = UUID.randomUUID().toString();
        AtomicLong sequence = new AtomicLong();
        String augmentedContent = augmentContent(content, files);
        ChatContext context = prepare(conversationId, augmentedContent, explicitAgent, regenerate);
        List<ConversationRepository.ChatMessage> history = new ArrayList<>(context.history());
        StringBuilder finalAnswer = new StringBuilder();
        StringBuilder finalReasoning = new StringBuilder();
        List<UiBlock> uiBlocks = new ArrayList<>();
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_started", "state", "running")));
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "agent", "agent",
                context.agent().getId(), "agentName", context.agent().getName())));

        for (int round = 1; round <= context.maxRounds(); round++) {
            sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "round_started",
                    "state", "awaiting_model", "round", round)));
            sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "agent_status",
                    "phase", "thinking", "round", round, "toolCount", context.toolDefinitions().size())));
            StringBuilder answer = new StringBuilder();
            StringBuilder reasoning = new StringBuilder();
            Map<Integer, ToolCallAccumulator> calls = new LinkedHashMap<>();
            UsageAccumulator usage = new UsageAccumulator();
            adapters.stream(context.endpoint(), context.apiKey(), history, context.systemPrompt(), context.toolDefinitions())
                    .toStream().forEach(chunk -> collect(chunk, answer, reasoning, calls, usage, runId, sequence, sink));
            finalAnswer.append(answer);
            finalReasoning.append(reasoning);

            List<ToolCall> completedCalls = calls.values().stream()
                    .filter(call -> call.name != null && !call.name.isBlank())
                    .map(ToolCallAccumulator::complete).toList();
            if (completedCalls.isEmpty()) {
                String assistantMessageId = conversations.insertMessage(conversationId, "assistant", finalAnswer.toString(),
                        finalReasoning.toString().isBlank() ? null : finalReasoning.toString(), null);
                persistUiBlocks(assistantMessageId, uiBlocks);
                int inputTokens = usage.input != null ? usage.input : estimate(history);
                int outputTokens = usage.output != null ? usage.output : estimate(finalAnswer.toString());
                String usageSource = usage.input != null && usage.output != null ? "provider" : "estimated";
                tokenUsage.record(conversationId, inputTokens, outputTokens, usageSource);
                enqueueMemoryIfEnabled(conversationId, content);
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "token_usage",
                        "estimatedTokens", inputTokens + outputTokens, "source", usageSource)));
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "answer_ready")));
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_completed",
                        "state", "completed", "content", finalAnswer.toString(),
                        "reasoning", finalReasoning.toString(), "estimatedTokens", inputTokens + outputTokens)));
                sink.complete();
                return;
            }

            history.add(new ConversationRepository.ChatMessage("assistant", answer.toString(),
                    reasoning.toString(), completedCalls, null));
            for (ToolCall call : completedCalls) {
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "tool_call_start",
                        "state", "executing_tools", "round", round, "callId", call.id(),
                        "toolName", call.name(), "arguments", parseArguments(call.arguments()))));
                @SuppressWarnings("unchecked") Map<String,Object> arguments = parseArguments(call.arguments()) instanceof Map<?,?> raw
                        ? (Map<String,Object>) raw : Map.of();
                String approvalReason = tools.approvalReason(call.name(), arguments);
                if (approvalReason != null) {
                    String approvalId = approvals.create(conversationId, call, approvalReason,
                            new ResumeState(context, new ArrayList<>(history), round,
                                    finalAnswer.toString(), finalReasoning.toString()));
                    sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "approval_required",
                            "round", round, "callId", call.id(), "toolName", call.name(),
                            "approvalId", approvalId, "reason", approvalReason)));
                    sink.complete();
                    return;
                }
                String result = tools.execute(context.toolSnapshot(), call.name(), call.arguments(), conversationId);
                history.add(new ConversationRepository.ChatMessage("tool", result, null, List.of(), call.id()));
                collectWikiUi(result, uiBlocks, runId, sequence, sink);
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "tool_call_end",
                        "round", round, "callId", call.id(), "toolName", call.name(),
                        "result", result, "status", "success")));
            }
        }
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "loop_detected",
                "state", "finalizing", "round", context.maxRounds(), "message", "Maximum ReAct rounds reached")));
        String assistantMessageId = conversations.insertMessage(conversationId, "assistant", finalAnswer.toString(),
                finalReasoning.toString().isBlank() ? null : finalReasoning.toString(), null);
        persistUiBlocks(assistantMessageId, uiBlocks);
        int inputTokens = estimate(history);
        int outputTokens = estimate(finalAnswer.toString());
        tokenUsage.record(conversationId, inputTokens, outputTokens, "estimated");
        enqueueMemoryIfEnabled(conversationId, contentFromHistory(history));
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "token_usage",
                "estimatedTokens", inputTokens + outputTokens, "source", "estimated")));
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "answer_ready")));
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_completed", "state", "completed",
                "content", finalAnswer.toString(), "reasoning", finalReasoning.toString(),
                "estimatedTokens", inputTokens + outputTokens)));
        sink.complete();
    }

    /** Resumes one approved or denied tool call through the compatible SSE channel. */
    public Flux<ServerSentEvent<String>> resumeApproval(String conversationId, String approvalId, String action) {
        if (!gate.tryAcquire(conversationId)) return Flux.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Conversation is already running or AI concurrency limit reached"));
        return Flux.<ServerSentEvent<String>>create(sink -> {
            ToolApprovalStore.PendingApproval approval = approvals.consume(conversationId, approvalId);
            if (approval == null) {
                sink.next(failed(UUID.randomUUID().toString(), new IllegalArgumentException("审批不存在、已过期或已被消费")));
                sink.complete();
                gate.release(conversationId);
                return;
            }
            String runId = UUID.randomUUID().toString();
            try {
                if ("deny".equals(action)) {
                    sink.next(event(runId, 1, Map.of("type", "tool_call_error", "callId", approval.call().id(), "toolName", approval.call().name(), "error", "已拒绝执行")));
                    sink.next(event(runId, 2, Map.of("type", "run_completed", "state", "completed", "content", "")));
                    sink.complete();
                    return;
                }
                String result = tools.execute(approval.call().name(), approval.call().arguments(), conversationId);
                sink.next(event(runId, 1, Map.of("type", "tool_call_end", "callId", approval.call().id(), "toolName", approval.call().name(), "result", result, "status", "success")));
                if (approval.resume() instanceof ResumeState state) {
                    state.history().add(new ConversationRepository.ChatMessage("tool", result, null, List.of(), approval.call().id()));
                    continueRun(state.context(), state.history(), state.round(), new StringBuilder(state.answer()),
                            new StringBuilder(state.reasoning()), runId, new AtomicLong(1), sink);
                } else {
                    sink.next(event(runId, 2, Map.of("type", "run_completed", "state", "completed", "content", "")));
                    sink.complete();
                }
            } catch (Exception error) {
                sink.next(failed(runId, error));
                sink.complete();
            } finally {
                gate.release(conversationId);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private void continueRun(ChatContext context, List<ConversationRepository.ChatMessage> history, int startRound,
                             StringBuilder finalAnswer, StringBuilder finalReasoning, String runId, AtomicLong sequence,
                             reactor.core.publisher.FluxSink<ServerSentEvent<String>> sink) {
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_started", "state", "running")));
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "agent", "agent", context.agent().getId())));
        List<UiBlock> uiBlocks = new ArrayList<>();
        for (int round = startRound; round <= context.maxRounds(); round++) {
            sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "round_started", "state", "awaiting_model", "round", round)));
            StringBuilder answer = new StringBuilder(); StringBuilder reasoning = new StringBuilder();
            Map<Integer, ToolCallAccumulator> calls = new LinkedHashMap<>(); UsageAccumulator usage = new UsageAccumulator();
            adapters.stream(context.endpoint(), context.apiKey(), history, context.systemPrompt(), context.toolDefinitions())
                    .toStream().forEach(chunk -> collect(chunk, answer, reasoning, calls, usage, runId, sequence, sink));
            finalAnswer.append(answer); finalReasoning.append(reasoning);
            List<ToolCall> completed = calls.values().stream().filter(call -> call.name != null && !call.name.isBlank()).map(ToolCallAccumulator::complete).toList();
            if (completed.isEmpty()) {
                String assistantMessageId = conversations.insertMessage(context.conversationId(), "assistant", finalAnswer.toString(), finalReasoning.isEmpty() ? null : finalReasoning.toString(), null);
                persistUiBlocks(assistantMessageId, uiBlocks);
                int input = usage.input != null ? usage.input : estimate(history); int output = usage.output != null ? usage.output : estimate(finalAnswer.toString());
                tokenUsage.record(context.conversationId(), input, output, usage.input != null && usage.output != null ? "provider" : "estimated");
                enqueueMemoryIfEnabled(context.conversationId(), contentFromHistory(history));
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "token_usage", "estimatedTokens", input + output)));
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "answer_ready")));
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_completed", "state", "completed", "content", finalAnswer.toString(), "reasoning", finalReasoning.toString())));
                sink.complete(); return;
            }
            history.add(new ConversationRepository.ChatMessage("assistant", answer.toString(), reasoning.toString(), completed, null));
            for (ToolCall call : completed) {
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "tool_call_start", "round", round, "callId", call.id(), "toolName", call.name(), "arguments", parseArguments(call.arguments()))));
                String approvalReason = tools.approvalReason(call.name(), parseArguments(call.arguments()) instanceof Map<?,?> raw ? castMap(raw) : Map.of());
                if (approvalReason != null) {
                    String approvalId = approvals.create(context.conversationId(), call, approvalReason, new ResumeState(context, new ArrayList<>(history), round, finalAnswer.toString(), finalReasoning.toString()));
                    sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "approval_required", "round", round, "callId", call.id(), "toolName", call.name(), "approvalId", approvalId, "reason", approvalReason)));
                    sink.complete(); return;
                }
                String result = tools.execute(context.toolSnapshot(), call.name(), call.arguments(), context.conversationId()); history.add(new ConversationRepository.ChatMessage("tool", result, null, List.of(), call.id()));
                collectWikiUi(result, uiBlocks, runId, sequence, sink);
                sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "tool_call_end", "round", round, "callId", call.id(), "toolName", call.name(), "result", result, "status", "success")));
            }
        }
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "loop_detected", "round", context.maxRounds(), "message", "Maximum ReAct rounds reached")));
        String assistantMessageId = conversations.insertMessage(context.conversationId(), "assistant", finalAnswer.toString(), finalReasoning.toString(), null);
        persistUiBlocks(assistantMessageId, uiBlocks);
        sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "run_completed", "state", "completed", "content", finalAnswer.toString())));
        sink.complete();
    }

    private void enqueueMemoryIfEnabled(String conversationId, String content) {
        if (settings.memoryEnabled() && content != null && !content.isBlank()) memoryProcessing.enqueue(conversationId);
    }

    /** Emits official A2UI v0.9 source surfaces for structured Wiki search results. */
    private void collectWikiUi(String rawResult, List<UiBlock> blocks, String runId, AtomicLong sequence,
                               reactor.core.publisher.FluxSink<ServerSentEvent<String>> sink) {
        try {
            com.fasterxml.jackson.databind.JsonNode root = mapper.readTree(rawResult);
            if (!root.has("results") || !root.get("results").isArray()) return;
            int index = blocks.size();
            for (com.fasterxml.jackson.databind.JsonNode item : root.get("results")) {
                String file = item.path("file").asText("");
                if (file.isBlank()) continue;
                String segmentId = "a2ui-segment-" + UUID.randomUUID();
                String surfaceId = "answer-source-" + UUID.randomUUID();
                Map<String,Object> source = new LinkedHashMap<>();
                source.put("refId", "C" + (index + 1)); source.put("title", item.path("title").asText(file));
                source.put("file", file); source.put("heading", item.path("heading").asText(""));
                source.put("snippet", item.path("snippet").asText("")); source.put("chunkId", item.path("chunkId").asText(file + "#0"));
                source.put("score", item.path("score").asDouble(1));
                Map<String,Object> create = Map.of("version", "v0.9", "createSurface", Map.of("surfaceId", surfaceId, "catalogId", "mint"));
                Map<String,Object> components = Map.of("version", "v0.9", "updateComponents", Map.of("surfaceId", surfaceId,
                        "components", List.of(Map.of("id", "root", "component", "SourceReferenceCard", "data", Map.of("path", "/source")))));
                Map<String,Object> data = Map.of("version", "v0.9", "updateDataModel", Map.of("surfaceId", surfaceId, "path", "/source", "value", source));
                for (Map<String,Object> message : List.of(create, components, data)) {
                    sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "a2ui", "segmentId", segmentId, "surfaceId", surfaceId, "message", message)));
                }
                String now = Instant.now().toString();
                blocks.add(new UiBlock(UUID.randomUUID().toString(), "", index++, source.get("refId") instanceof Number n ? n.intValue() : 0,
                        "wiki_source_reference", 1, source, now, now));
            }
        } catch (Exception ignored) { }
    }

    private void persistUiBlocks(String messageId, List<UiBlock> blocks) {
        int index = 0;
        for (UiBlock block : blocks) {
            block.setMessageId(messageId); block.setBlockIndex(index++);
            try { conversations.insertUiBlock(block); } catch (RuntimeException error) { log.warn("Unable to persist A2UI block", error); }
        }
    }

    private String contentFromHistory(List<ConversationRepository.ChatMessage> history) {
        return history.stream().filter(item -> "user".equals(item.role())).map(ConversationRepository.ChatMessage::content)
                .filter(value -> value != null && !value.isBlank()).reduce("", (left, right) -> left + right);
    }

    private Map<String,Object> castMap(Map<?,?> raw) { Map<String,Object> value=new LinkedHashMap<>(); raw.forEach((key,item)->value.put(String.valueOf(key),item)); return value; }

    private record ResumeState(ChatContext context, List<ConversationRepository.ChatMessage> history, int round,
                               String answer, String reasoning) {}

    private ChatContext prepare(String conversationId, String content, String explicitAgent, boolean regenerate) {
        Conversation conversation = conversations.findById(conversationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
        if (!regenerate) conversations.insertMessage(conversation.id(), "user", content, null, null);
        ModelEndpoint endpoint = endpoints.activeText()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active model endpoint"));
        RoutingService.RouteResult route = routing.route(content, conversation, explicitAgent);
        String apiKey = endpoint.encryptedApiKey();
        if (apiKey != null && apiKey.contains(":")) apiKey = encryption.decrypt(apiKey);
        Map<String, Tool> toolSnapshot = tools.snapshot();
        String agentPrompt = route.agent() == null ? "" : route.agent().getSystemPrompt();
        String systemPrompt = agentPrompt == null || agentPrompt.isBlank() ? settings.systemPrompt() : agentPrompt;
        if (settings.memoryEnabled()) systemPrompt = withMemories(systemPrompt);
        return new ChatContext(conversationId, endpoint, apiKey == null ? "" : apiKey,
                conversations.findHistory(conversationId), systemPrompt, Math.max(1, settings.reactMaxIterations()),
                route.agent(),
                toolSnapshot, List.copyOf(tools.definitions(toolSnapshot)));
    }

    /** Extracts the text portion of Node-compatible base64 file attachments. */
    private String augmentContent(String content, Object files) {
        String base = content == null ? "" : content;
        if (!(files instanceof List<?> attachments) || attachments.isEmpty()) return base;
        StringBuilder result = new StringBuilder(base);
        result.append("\n\n以下是从上传文件中提取的内容：");
        for (Object attachment : attachments) {
            if (!(attachment instanceof Map<?, ?> raw)) continue;
            Object rawName = raw.containsKey("name") ? raw.get("name") : "upload";
            Object rawContent = raw.containsKey("content") ? raw.get("content") : "";
            String name = String.valueOf(rawName);
            String encoded = String.valueOf(rawContent);
            try {
                String text = new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
                result.append("\n\n--- 上传文件：").append(name).append(" ---\n")
                        .append(text).append("\n--- 文件结束 ---");
            } catch (IllegalArgumentException error) {
                result.append("\n[文件 ").append(name).append("] 内容解析失败，已跳过");
            }
        }
        return result.toString();
    }

    private String withMemories(String systemPrompt) {
        StringBuilder result = new StringBuilder(systemPrompt == null ? "" : systemPrompt);
        var active = memories.findActive(null);
        if (!active.isEmpty()) {
            result.append("\n\n以下是可用于本次回答的用户长期记忆：\n");
            active.stream().limit(20).forEach(memory -> result.append("- [").append(memory.getCategory()).append("] ").append(memory.getContent()).append('\n'));
        }
        return result.toString();
    }

    private void collect(AiChunk chunk, StringBuilder answer, StringBuilder reasoning,
                         Map<Integer, ToolCallAccumulator> calls, UsageAccumulator usage, String runId, AtomicLong sequence,
                         reactor.core.publisher.FluxSink<ServerSentEvent<String>> sink) {
        if (chunk.content() != null && !chunk.content().isEmpty()) {
            answer.append(chunk.content());
            sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "answer",
                    "content", chunk.content())));
        }
        if (chunk.reasoning() != null && !chunk.reasoning().isEmpty()) {
            reasoning.append(chunk.reasoning());
            sink.next(event(runId, sequence.incrementAndGet(), Map.of("type", "thought",
                    "reasoning", chunk.reasoning())));
        }
        ToolCallDelta delta = chunk.toolCall();
        if (delta != null) calls.computeIfAbsent(delta.index(), ignored -> new ToolCallAccumulator())
                .append(delta);
        if (chunk.inputTokens() != null) usage.input = chunk.inputTokens();
        if (chunk.outputTokens() != null) usage.output = chunk.outputTokens();
    }

    private Object parseArguments(String arguments) {
        try {
            return mapper.readValue(arguments == null || arguments.isBlank() ? "{}" : arguments, Object.class);
        } catch (JsonProcessingException error) {
            return arguments;
        }
    }

    private int estimate(List<ConversationRepository.ChatMessage> history) {
        return history.stream().mapToInt(message -> estimate(message.content())).sum();
    }

    private int estimate(String value) {
        return Math.max(1, (value == null ? 0 : value.length() + 2) / 3);
    }

    private ServerSentEvent<String> failed(String runId, Exception error) {
        return event(runId, 1, Map.of("type", "run_failed", "state", "failed",
                "error", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
    }

    private ServerSentEvent<String> event(String runId, long sequence, Map<String, Object> payload) {
        Map<String, Object> event = new LinkedHashMap<>(payload);
        event.put("runId", runId);
        event.put("sequence", sequence);
        try {
            return ServerSentEvent.<String>builder(" " + mapper.writeValueAsString(event)).build();
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Unable to encode SSE event", error);
        }
    }

    private record ChatContext(String conversationId, ModelEndpoint endpoint, String apiKey,
                               List<ConversationRepository.ChatMessage> history, String systemPrompt, int maxRounds,
                               AgentResponse agent, Map<String, Tool> toolSnapshot, List<ToolDefinition> toolDefinitions) {
    }

    private static final class ToolCallAccumulator {
        private String id;
        private String name;
        private final StringBuilder arguments = new StringBuilder();

        private void append(ToolCallDelta delta) {
            if (delta.id() != null) id = delta.id();
            if (delta.name() != null) name = delta.name();
            if (delta.arguments() != null) arguments.append(delta.arguments());
        }

        private ToolCall complete() {
            return new ToolCall(id == null ? UUID.randomUUID().toString() : id, name, arguments.toString());
        }
    }

    private static final class UsageAccumulator {
        private Integer input;
        private Integer output;
    }
}
