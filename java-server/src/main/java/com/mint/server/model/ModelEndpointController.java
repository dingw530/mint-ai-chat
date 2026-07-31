package com.mint.server.model;

import com.mint.server.model.dto.ModelEndpointRequest;
import com.mint.server.model.dto.ModelEndpointResponse;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Model endpoint settings API. */
@RestController
@RequestMapping("/api/endpoints")
public class ModelEndpointController {
    private final ModelEndpointService service;

    /** Creates the controller. */
    public ModelEndpointController(ModelEndpointService service) { this.service = service; }
    /** Lists endpoints. */
    @GetMapping({"", "/"}) public Map<String, List<ModelEndpointResponse>> list() { return Map.of("endpoints", service.list()); }
    /** Creates an endpoint. */
    @PostMapping({"", "/"}) public Map<String, ModelEndpointResponse> create(@RequestBody ModelEndpointRequest body) { return Map.of("endpoint", service.create(body)); }
    /** Updates an endpoint. */
    @PutMapping("/{id}") public Map<String, ModelEndpointResponse> update(@PathVariable String id, @RequestBody ModelEndpointRequest body) { return Map.of("endpoint", service.update(id, body)); }
    /** Deletes an endpoint. */
    @DeleteMapping("/{id}") public Map<String, Boolean> delete(@PathVariable String id) { service.delete(id); return Map.of("success", true); }
    /** Activates an endpoint. */
    @PutMapping("/{id}/activate") public Map<String, Boolean> activate(@PathVariable String id) { service.activate(id); return Map.of("success", true); }
}
