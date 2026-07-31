package com.mint.server.mcp;

import com.mint.server.mcp.dto.McpServerRequest;
import com.mint.server.mcp.dto.McpServerListResponse;
import com.mint.server.mcp.dto.McpServerMutationResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** MCP settings endpoints; tool definitions are saved explicitly, not discovered. */
@RestController
@RequestMapping("/api/mcp-servers")
public class McpController {
    private final McpToolService service;

    /** Creates the MCP controller. */
    public McpController(McpToolService service) { this.service = service; }

    /** Lists configured MCP servers and saved tools. */
    @GetMapping({"", "/"})
    public McpServerListResponse list() { return new McpServerListResponse(service.list()); }

    /** Gets one configured MCP server. */
    @GetMapping("/{id}")
    public McpServerMutationResponse get(@PathVariable String id) { return new McpServerMutationResponse(service.get(id)); }

    /** Saves a server and its direct tool definitions. */
    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public McpServerMutationResponse create(@RequestBody McpServerRequest body) { return new McpServerMutationResponse(service.create(body)); }

    /** Updates a server and atomically replaces its tool definitions. */
    @PutMapping("/{id}")
    public McpServerMutationResponse update(@PathVariable String id, @RequestBody McpServerRequest body) { return new McpServerMutationResponse(service.update(id, body)); }

    /** Deletes a server. */
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) { service.delete(id); return Map.of("success", true); }

    /** Re-registers saved MCP tools immediately. */
    @PostMapping("/{id}/restart")
    public McpServerMutationResponse restart(@PathVariable String id) { return new McpServerMutationResponse(service.restart(id)); }
}
