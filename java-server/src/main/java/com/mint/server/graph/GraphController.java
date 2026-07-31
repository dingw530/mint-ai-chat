package com.mint.server.graph;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** HTTP API for graph nodes, edges and review candidates. */
@RestController
@RequestMapping("/api/graph")
public class GraphController {
    private final GraphService service;
    /** Creates the graph controller. */
    public GraphController(GraphService service) { this.service = service; }
    @GetMapping("/data") public Map<String,Object> data() { return service.data(); }
    @GetMapping("/node/{id}") public Map<String,Object> node(@PathVariable String id) { return service.node(id); }
    @GetMapping("/node/{id}/neighbors") public Map<String,Object> neighbors(@PathVariable String id) { return service.neighbors(id); }
    @GetMapping("/search") public List<Map<String,Object>> search(@RequestParam(defaultValue = "") String query) { return service.search(query); }
    @PostMapping("/node") public Map<String,Object> createNode(@RequestBody Map<String,Object> body) { return service.createNode(body); }
    @PostMapping("/edge") public Map<String,Object> createEdge(@RequestBody Map<String,Object> body) { return service.createEdge(body); }
    @DeleteMapping("/node/{id}") public Map<String,Boolean> deleteNode(@PathVariable String id) { service.deleteNode(id); return Map.of("success",true); }
    @DeleteMapping("/edge/{id}") public Map<String,Boolean> deleteEdge(@PathVariable String id) { service.deleteEdge(id); return Map.of("success",true); }
    @GetMapping("/candidates") public List<Map<String,Object>> candidates(@RequestParam(required=false) String status) { return service.candidates(status); }
    @PostMapping("/candidates/{id}/accept") public Map<String,Object> accept(@PathVariable String id) { return service.acceptCandidate(id); }
    @PostMapping("/candidates/{id}/reject") public Map<String,Object> reject(@PathVariable String id, @RequestBody(required=false) Map<String,Object> body) { return service.rejectCandidate(id,body == null ? null : String.valueOf(body.get("note"))); }
}
