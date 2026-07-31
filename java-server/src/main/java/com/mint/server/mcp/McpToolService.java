package com.mint.server.mcp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.mcp.dto.McpServerRequest;
import com.mint.server.mcp.dto.McpServerResponse;
import com.mint.server.mcp.dto.McpToolRequest;
import com.mint.server.tool.Tool;
import com.mint.server.tool.ToolRegistry;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.DependsOn;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

/** Persists MCP settings and atomically refreshes directly registered tools. */
@Service
@DependsOn("sqliteMigrationRunner")
public class McpToolService {
    private final McpRepository repository;
    private final ObjectMapper mapper;
    private final ToolRegistry registry;
    private final WebClient.Builder clientBuilder;

    /** Creates the MCP settings service. */
    public McpToolService(McpRepository repository, ObjectMapper mapper, ToolRegistry registry,
                          WebClient.Builder clientBuilder) {
        this.repository = repository;
        this.mapper = mapper;
        this.registry = registry;
        this.clientBuilder = clientBuilder;
    }

    /** Registers configured tools at startup without discovery. */
    @PostConstruct
    public void initialize() {
        refreshRegistry();
    }

    /** Lists configured servers and their saved tool definitions. */
    public List<McpServerResponse> list() {
        return repository.findAll();
    }

    /** Gets one configured MCP server. */
    public McpServerResponse get(String id) { return list().stream().filter(server -> id.equals(server.getId())).findFirst().orElseThrow(() -> new IllegalArgumentException("MCP Server not found")); }

    /** Refreshes direct registrations for one MCP server immediately. */
    public McpServerResponse restart(String id) { get(id); refreshRegistry(); return get(id); }

    /** Creates an HTTP MCP server and saves all tool definitions supplied by the settings page. */
    @Transactional
    public McpServerResponse create(McpServerRequest input) {
        String name = required(input.getName(), "name");
        String url = required(input.getUrl(), "url");
        validateUrl(url);
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        repository.insertServer(id, name, url, json(input.getHeaders()), now);
        saveTools(id, input.getTools());
        refreshRegistry();
        return findById(id);
    }

    /** Updates server metadata and replaces its saved tool definitions immediately. */
    @Transactional
    public McpServerResponse update(String id, McpServerRequest input) {
        String url = required(input.getUrl(), "url");
        validateUrl(url);
        int changed = repository.updateServer(id, required(input.getName(), "name"), url, json(input.getHeaders()), Instant.now().toString());
        if (changed == 0) throw new IllegalArgumentException("MCP Server not found");
        repository.deleteTools(id);
        saveTools(id, input.getTools());
        refreshRegistry();
        return findById(id);
    }

    /** Deletes a server and its direct registrations. */
    @Transactional
    public void delete(String id) {
        repository.deleteServer(id);
        refreshRegistry();
    }

    /** Rebuilds only the saved-tool registry; no MCP discovery request is made. */
    public void refreshRegistry() {
        List<Tool> registered = repository.findRegisteredTools().stream().<Tool>map(item -> new ConfiguredMcpTool(item.getServerName(), item.getUrl(), item.getTransport(),
                        new ToolDefinition(item.getName(), item.getDescription(), item.getSchema()), item.getHeaders(),
                        clientBuilder.build(), mapper)).toList();
        registry.replaceMcpTools(registered);
    }

    private void saveTools(String serverId, List<McpToolRequest> list) {
        if (list == null) return;
        Set<String> names = new HashSet<>();
        for (McpToolRequest tool : list) {
            String name = required(tool.getName(), "name");
            if (!names.add(name)) throw new IllegalArgumentException("Duplicate MCP tool name: " + name);
            Object inputSchema = tool.getInputSchema() == null ? Map.of() : tool.getInputSchema();
            if (!(inputSchema instanceof Map<?, ?>)) throw new IllegalArgumentException("inputSchema must be an object");
            String transport = tool.getTransport() == null ? "streamable-http" : tool.getTransport();
            if (!Set.of("sse", "http/sse", "streamable-http", "streamable_http").contains(transport)) {
                throw new IllegalArgumentException("Unsupported MCP transport: " + transport);
            }
            repository.insertTool(serverId, tool, json(inputSchema), transport, Instant.now().toString());
        }
    }

    private McpServerResponse findById(String id) {
        return list().stream().filter(server -> id.equals(server.getId())).findFirst().orElseThrow();
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("Invalid JSON configuration", error); }
    }
    private String required(String rawValue, String key) {
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.isEmpty()) throw new IllegalArgumentException(key + " is required");
        return value;
    }
    private void validateUrl(String url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) throw new IllegalArgumentException("url must be http(s)");
    }
}
