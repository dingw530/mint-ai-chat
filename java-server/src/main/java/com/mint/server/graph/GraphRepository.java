package com.mint.server.graph;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.db.mapper.SqlMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for knowledge graph data. */
@Repository
public class GraphRepository {
    private final SqlMapper mapper;
    private final ObjectMapper json;

    /** Creates the graph repository. */
    public GraphRepository(SqlMapper mapper, ObjectMapper json) { this.mapper = mapper; this.json = json; }

    /** Returns graph nodes and edges. */
    public Map<String, Object> data() { return Map.of("nodes", nodes(mapper.graphNodes()), "edges", edges(mapper.graphEdges())); }
    /** Returns one graph node using the Node endpoint response shape. */
    public Map<String, Object> node(String id) {
        List<Map<String, Object>> rows = mapper.graphNode(id);
        if (rows.isEmpty()) return null;
        return node(rows.get(0));
    }
    /** Returns the Node-compatible node/edge neighborhood response. */
    public Map<String, Object> neighbors(String id) {
        List<Map<String, Object>> rows = mapper.graphNode(id);
        if (rows.isEmpty()) return null;
        return Map.of("node", node(rows.get(0)), "edges", edges(mapper.graphEdgesForNode(id)));
    }
    /** Searches nodes by label. */
    public List<Map<String, Object>> search(String query) { return nodes(mapper.searchGraphNodes(query == null ? "" : query)); }
    /** Creates a node. */
    public Map<String, Object> createNode(Map<String, Object> input) {
        String now = Instant.now().toString();
        Map<String, Object> p = new HashMap<>(input);
        p.put("id", UUID.randomUUID().toString()); p.put("properties", json(input.getOrDefault("properties", Map.of())));
        p.put("sourceFile", input.get("sourceFile")); p.put("now", now); mapper.insertGraphNode(p);
        return node(mapper.graphNode((String) p.get("id")).get(0));
    }
    /** Creates an edge. */
    public Map<String, Object> createEdge(Map<String, Object> input) {
        String now = Instant.now().toString();
        Map<String, Object> p = new HashMap<>(input);
        p.put("id", UUID.randomUUID().toString()); p.put("properties", json(input.getOrDefault("properties", Map.of())));
        p.put("source", input.getOrDefault("source", "manual")); p.put("now", now); mapper.insertGraphEdge(p);
        return edge(mapper.graphEdges().stream().filter(row -> p.get("id").equals(row.get("id"))).findFirst().orElse(p));
    }
    /** Deletes a node. */
    public void deleteNode(String id) { mapper.deleteGraphNode(id); }
    /** Deletes an edge. */
    public void deleteEdge(String id) { mapper.deleteGraphEdge(id); }
    /** Lists graph edge candidates. */
    public List<Map<String, Object>> candidates(String status) { return mapper.graphCandidates(status).stream().map(this::candidate).toList(); }
    /** Reviews one graph edge candidate. */
    public Map<String, Object> review(String id, String status, String note) {
        if ("accepted".equals(status)) {
            Map<String,Object> candidate = mapper.graphCandidate(id).stream().findFirst().orElse(null);
            if (candidate == null || !"pending".equals(candidate.get("status"))) return null;
            Map<String,Object> edge = new HashMap<>();
            edge.put("sourceId", candidate.get("source_id"));
            edge.put("targetId", candidate.get("target_id"));
            edge.put("relation", candidate.get("relation"));
            edge.put("source", "ai-generated");
            edge.put("properties", Map.of("strength", "semantic", "confidence", candidate.get("confidence"),
                    "evidence", candidate.get("evidence"), "evidenceType", "source_excerpt",
                    "sourceFile", candidate.get("source_page")));
            Map<String,Object> created = createEdge(edge);
            Map<String,Object> review = new HashMap<>();
            review.put("id", id); review.put("status", status); review.put("edge", created);
            Map<String,Object> update = new HashMap<>(); update.put("id", id); update.put("status", status);
            update.put("note", note); update.put("now", Instant.now().toString()); mapper.reviewGraphCandidate(update);
            return review;
        }
        Map<String, Object> p = new HashMap<>(); p.put("id", id); p.put("status", status); p.put("note", note); p.put("now", Instant.now().toString());
        if (mapper.reviewGraphCandidate(p) == 0) return null;
        return mapper.graphCandidate(id).stream().map(this::candidate).findFirst().orElse(null);
    }
    /** Accepts a pending candidate by materializing the official semantic edge. */
    public Map<String,Object> acceptCandidate(String id) {
        Map<String,Object> candidate=mapper.graphCandidate(id).stream().findFirst().orElse(null);
        if(candidate==null || !"pending".equals(candidate.get("status"))) return null;
        String source=String.valueOf(candidate.get("source_id")); String target=String.valueOf(candidate.get("target_id"));
        boolean duplicate=mapper.graphEdges().stream().anyMatch(edge -> !"references".equals(edge.get("relation")) &&
                ((source.equals(edge.get("source_id")) && target.equals(edge.get("target_id"))) ||
                        (target.equals(edge.get("source_id")) && source.equals(edge.get("target_id")))));
        if(duplicate) throw new IllegalStateException("该节点对已有正式语义边");
        String relation=String.valueOf(candidate.get("relation")); if(relation.isBlank() || "references".equals(relation)) throw new IllegalArgumentException("候选关系无效");
        Map<String,Object> props=new HashMap<>(); props.put("strength","semantic"); props.put("confidence",candidate.get("confidence")); props.put("evidence",candidate.get("evidence")); props.put("evidenceType","source_excerpt"); props.put("sourceFile",candidate.get("source_page"));
        Map<String,Object> edge=new HashMap<>(); edge.put("sourceId",source);edge.put("targetId",target);edge.put("relation",relation);edge.put("source","ai-generated");edge.put("properties",props); Map<String,Object> created=createEdge(edge);
        Map<String,Object> update=new HashMap<>(); update.put("id",id);update.put("status","accepted");update.put("note",null);update.put("now",Instant.now().toString());mapper.reviewGraphCandidate(update); return created;
    }
    /** Rejects a pending candidate without creating a graph edge. */
    public Map<String,Object> rejectCandidate(String id,String note) { Map<String,Object> candidate=mapper.graphCandidate(id).stream().findFirst().orElse(null); if(candidate==null || !"pending".equals(candidate.get("status"))) return null; Map<String,Object> update=new HashMap<>();update.put("id",id);update.put("status","rejected");update.put("note",note);update.put("now",Instant.now().toString());mapper.reviewGraphCandidate(update);return Map.of("success",true); }
    private List<Map<String, Object>> nodes(List<Map<String, Object>> rows) { return rows.stream().map(this::node).toList(); }
    private List<Map<String, Object>> edges(List<Map<String, Object>> rows) { return rows.stream().map(this::edge).toList(); }
    private Map<String, Object> node(Map<String, Object> r) { Map<String, Object> x = new HashMap<>(); x.put("id", r.get("id")); x.put("label", r.get("label")); x.put("type", r.get("type")); x.put("sourceFile", value(r,"sourceFile","source_file")); x.put("properties", parse((String) value(r,"properties"))); x.put("createdAt", value(r,"createdAt","created_at")); x.put("updatedAt", value(r,"updatedAt","updated_at")); return x; }
    private Map<String, Object> edge(Map<String, Object> r) { Map<String, Object> x = new HashMap<>(); x.put("id", r.get("id")); x.put("sourceId", value(r,"sourceId","source_id")); x.put("relation", r.get("relation")); x.put("targetId", value(r,"targetId","target_id")); x.put("properties", parse((String) value(r,"properties"))); x.put("source", r.getOrDefault("source", "manual")); x.put("createdAt", value(r,"createdAt","created_at")); return x; }
    private Map<String, Object> candidate(Map<String, Object> r) { Map<String, Object> x = new HashMap<>(); for (Map.Entry<String,Object> entry : r.entrySet()) x.put(camel(entry.getKey()), entry.getValue()); return x; }
    private String camel(String key) { StringBuilder result = new StringBuilder(); boolean upper = false; for (char value : key.toCharArray()) { if (value == '_') { upper = true; } else { result.append(upper ? Character.toUpperCase(value) : value); upper = false; } } return result.toString(); }
    private Object value(Map<String,Object> r,String... keys) { for(String key:keys) if(r.containsKey(key)) return r.get(key); return null; }
    private Map<String,Object> parse(String raw) { try { return json.readValue(raw == null ? "{}" : raw, new TypeReference<>() {}); } catch (JsonProcessingException e) { return Map.of(); } }
    private String json(Object value) { try { return json.writeValueAsString(value); } catch (JsonProcessingException e) { throw new IllegalArgumentException("Invalid graph properties", e); } }
}
