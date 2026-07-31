package com.mint.server.tool;

import com.mint.server.ai.ToolCall;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Stores one-time pending tool approvals for the HTTP chat process. */
@Component
public class ToolApprovalStore {
    private final Map<String, PendingApproval> pending = new ConcurrentHashMap<>();
    /** Creates a pending approval request. */
    public String create(String conversationId, ToolCall call, String reason) { return create(conversationId, call, reason, null); }
    /** Creates a pending approval with an opaque ReAct continuation state. */
    public String create(String conversationId, ToolCall call, String reason, Object resume) { String id=UUID.randomUUID().toString(); pending.put(id,new PendingApproval(id,conversationId,call,reason,Instant.now(),resume)); return id; }
    /** Consumes an approval request once. */
    public PendingApproval consume(String conversationId, String id) { PendingApproval value=pending.remove(id); return value != null && value.conversationId().equals(conversationId) ? value : null; }
    /** Pending tool approval value. */
    public record PendingApproval(String id,String conversationId,ToolCall call,String reason,Instant createdAt,Object resume) {}
}
