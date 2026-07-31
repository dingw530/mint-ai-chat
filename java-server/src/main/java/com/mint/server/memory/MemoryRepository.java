package com.mint.server.memory;

import com.mint.server.db.mapper.SqlMapper;
import com.mint.server.memory.dto.MemoryResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for memories. */
@Repository
public class MemoryRepository {
    private final SqlMapper mapper;
    public MemoryRepository(SqlMapper mapper) { this.mapper = mapper; }
    public List<MemoryResponse> findActive(String category) { return mapper.memories(category).stream().map(this::map).toList(); }
    public void insert(String id, String content, String category, String sourceConversationId, String now) { Map<String,Object> p = new java.util.HashMap<>(); p.put("id", id); p.put("content", content); p.put("category", category); p.put("sourceConversationId", sourceConversationId); p.put("now", now); mapper.insertMemory(p); }
    public void update(String id, String content, String category, String now) { mapper.updateMemory(Map.of("id", id, "content", content, "category", category, "now", now)); }
    public void softDelete(String id, String now) { mapper.deleteMemory(Map.of("id", id, "now", now)); }
    public Optional<MemoryResponse> findById(String id) { return mapper.memory(id).stream().map(this::map).findFirst(); }
    /** Searches active memories for tool execution. */
    public List<Map<String,Object>> search(String query) { return mapper.searchMemories(query); }
    /** Saves an explicit memory created by a tool call. */
    public void saveToolMemory(String id, String content, String category, String conversationId, String now) { Map<String,Object> values=new HashMap<>(); values.put("id",id); values.put("content",content); values.put("category",category); values.put("sourceConversationId",conversationId); values.put("now",now); mapper.insertMemory(values); }
    /** Enqueues one conversation for asynchronous memory extraction. */
    public void enqueueProcessing(String conversationId) {
        String now = Instant.now().toString();
        mapper.enqueueMemoryJob(Map.of("id", UUID.randomUUID().toString(), "conversationId", conversationId, "now", now));
    }
    public Optional<Map<String,Object>> nextProcessing() {
        String now = Instant.now().toString();
        Map<String,Object> row = mapper.nextMemoryJob(now).stream().findFirst().orElse(null);
        if (row == null) return Optional.empty();
        Map<String,Object> claim = Map.of("id", row.get("id"), "now", now);
        return mapper.claimMemoryJob(claim) == 0 ? Optional.empty() : Optional.of(row);
    }
    public void completeProcessing(String id) { mapper.completeMemoryJob(Map.of("id", id, "now", Instant.now().toString())); }
    public void failProcessing(String id, String error) { mapper.failMemoryJob(Map.of("id", id, "error", error, "now", Instant.now().toString())); }
    private MemoryResponse map(Map<String,Object> row) { return new MemoryResponse((String) row.get("id"), (String) row.get("content"), (String) row.get("category"), (String) row.get("memoryKey"), (String) row.get("memoryType"), (String) row.get("subject"), number(row.get("confidence")), number(row.get("importance")), (String) row.get("status"), (String) row.get("sourceConversationId"), (String) row.get("createdAt"), (String) row.get("updatedAt")); }
    private double number(Object value) { return value instanceof Number n ? n.doubleValue() : 0; }
}
