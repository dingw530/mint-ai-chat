package com.mint.server.agent;

import com.mint.server.agent.dto.AgentResponse;
import com.mint.server.conversation.Conversation;
import com.mint.server.db.mapper.SqlMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for Agent routing decisions. */
@Repository
public class RoutingLogRepository {
    private final SqlMapper mapper;

    /** Creates the routing log repository. */
    public RoutingLogRepository(SqlMapper mapper) { this.mapper = mapper; }

    /** Persists one routing decision. */
    public void create(Conversation conversation, AgentResponse agent, double confidence, String method,
                       long latencyMs, String message) {
        if (agent == null) return;
        Map<String, Object> values = new HashMap<>();
        values.put("id", UUID.randomUUID().toString());
        values.put("conversationId", conversation.getId());
        values.put("agentId", agent.getId());
        values.put("confidence", confidence);
        values.put("method", method);
        values.put("latencyMs", latencyMs);
        values.put("messagePreview", message == null ? null : message.substring(0, Math.min(200, message.length())));
        values.put("lockedAgent", conversation.getLockedAgent());
        values.put("routingMode", conversation.getRoutingMode());
        values.put("createdAt", Instant.now().toString());
        mapper.insertRoutingLog(values);
    }

    /** Lists routing logs with optional conversation and pagination filters. */
    public List<Map<String, Object>> findAll(String conversationId, int page, int pageSize) {
        Map<String, Object> values = new HashMap<>();
        values.put("conversationId", conversationId);
        int limit = Math.min(Math.max(pageSize, 1), 100);
        values.put("limit", limit);
        values.put("offset", Math.max(page - 1, 0) * limit);
        return mapper.routingLogs(values);
    }
}
