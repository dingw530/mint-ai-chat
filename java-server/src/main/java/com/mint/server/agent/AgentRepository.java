package com.mint.server.agent;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.agent.dto.AgentResponse;
import com.mint.server.db.mapper.SqlMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for configurable agents. */
@Repository
public class AgentRepository {
    private final SqlMapper mapper;
    private final ObjectMapper json;
    public AgentRepository(SqlMapper mapper, ObjectMapper json) { this.mapper = mapper; this.json = json; }
    public List<AgentResponse> findAll() { return mapper.agents().stream().map(this::map).toList(); }
    public void insert(String id, String name, String description, String type, String prompt, boolean available, String mcpIds, String keywords, String now) { Map<String,Object> p = params(id,name,description,type,prompt,available,mcpIds,keywords,now); mapper.insertAgent(p); }
    public void update(String id, String name, String description, String type, String prompt, boolean available, String mcpIds, String keywords, String now) { mapper.updateAgent(params(id,name,description,type,prompt,available,mcpIds,keywords,now)); }
    public void delete(String id) { mapper.deleteAgent(id); }
    private Map<String,Object> params(String id,String name,String description,String type,String prompt,boolean available,String mcpIds,String keywords,String now) { Map<String,Object> p=new HashMap<>(); p.put("id",id);p.put("name",name);p.put("description",description);p.put("type",type);p.put("systemPrompt",prompt);p.put("available",available?1:0);p.put("mcpIds",mcpIds);p.put("keywords",keywords);p.put("now",now);return p; }
    private AgentResponse map(Map<String,Object> r) { return new AgentResponse((String)r.get("id"),(String)r.get("name"),(String)r.get("name"),(String)r.get("description"),(String)r.get("type"),(String)r.get("systemPrompt"),parse((String)r.get("toolIds")),parse((String)r.get("mcpServerIds")),number(r.get("available"))==1,(String)r.get("errorMessage"),parse((String)r.get("triggerKeywords")),(String)r.get("createdAt"),(String)r.get("updatedAt")); }
    private int number(Object value) { return value instanceof Number n ? n.intValue() : 0; }
    private List<String> parse(String value) { try { return json.readValue(value == null ? "[]" : value, new TypeReference<>() {}); } catch (JsonProcessingException e) { return List.of(); } }
}
