package com.mint.server.graph;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Validates and exposes knowledge graph operations. */
@Service
public class GraphService {
    private final GraphRepository repository;
    /** Creates the graph service. */
    public GraphService(GraphRepository repository) { this.repository = repository; }
    public Map<String, Object> data() { return repository.data(); }
    public Map<String, Object> node(String id) { Map<String,Object> value = repository.node(id); if (value == null) throw notFound("Graph node not found"); return value; }
    public Map<String, Object> neighbors(String id) { Map<String,Object> value = repository.neighbors(id); if (value == null) throw notFound("Graph node not found"); return value; }
    public List<Map<String,Object>> search(String query) { return repository.search(query); }
    public Map<String,Object> createNode(Map<String,Object> input) { require(input,"label"); require(input,"type"); return repository.createNode(input); }
    public Map<String,Object> createEdge(Map<String,Object> input) { require(input,"sourceId"); require(input,"relation"); require(input,"targetId"); return repository.createEdge(input); }
    public void deleteNode(String id) { repository.deleteNode(id); }
    public void deleteEdge(String id) { repository.deleteEdge(id); }
    public List<Map<String,Object>> candidates(String status) { return repository.candidates(status); }
    public Map<String,Object> review(String id, String status, String note) { Map<String,Object> value = repository.review(id,status,note); if (value == null) throw notFound("Graph candidate not found"); return value; }
    public Map<String,Object> acceptCandidate(String id) { Map<String,Object> value=repository.acceptCandidate(id); if (value==null) throw notFound("Graph candidate not found"); return value; }
    public Map<String,Object> rejectCandidate(String id, String note) { Map<String,Object> value=repository.rejectCandidate(id,note); if(value==null) throw notFound("Graph candidate not found"); return value; }
    private void require(Map<String,Object> input,String key) { if (input.get(key) == null || String.valueOf(input.get(key)).isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,key+" is required"); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND,message); }
}
