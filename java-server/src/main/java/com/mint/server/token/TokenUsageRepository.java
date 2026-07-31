package com.mint.server.token;

import com.mint.server.db.mapper.SqlMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for token usage. */
@Repository
public class TokenUsageRepository {
    private final SqlMapper mapper;
    public TokenUsageRepository(SqlMapper mapper) { this.mapper = mapper; }
    public void record(String conversationId, int inputTokens, int outputTokens, String source) { Map<String,Object> p=new HashMap<>();p.put("id",UUID.randomUUID().toString());p.put("conversationId",conversationId);p.put("inputTokens",inputTokens);p.put("outputTokens",outputTokens);p.put("totalTokens",inputTokens+outputTokens);p.put("source",source);p.put("createdAt",Instant.now().toString());mapper.insertTokenUsage(p); }
}
