package com.mint.server.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.tool.Tool;
import java.time.Duration;
import java.util.Map;
import org.springframework.web.reactive.function.client.WebClient;

/** Directly registered MCP tool; it never calls tools/list discovery. */
public class ConfiguredMcpTool implements Tool {
    private final String serverName;
    private final String endpoint;
    private final String transport;
    private final ToolDefinition definition;
    private final Map<String, String> headers;
    private final WebClient client;
    private final ObjectMapper mapper;

    /** Creates a configured MCP tool from settings-page metadata. */
    public ConfiguredMcpTool(String serverName, String endpoint, String transport,
                             ToolDefinition definition, Map<String, String> headers, WebClient client, ObjectMapper mapper) {
        this.serverName = serverName;
        this.endpoint = endpoint;
        this.transport = transport;
        this.definition = definition;
        this.headers = headers;
        this.client = client;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return serverName + "__" + definition.name();
    }

    @Override
    public ToolDefinition definition() {
        return new ToolDefinition(name(), definition.description(), definition.parameters());
    }

    @Override
    public String execute(Map<String, Object> arguments, String conversationId) {
        try {
            Map<String, Object> request = Map.of("jsonrpc", "2.0", "id", conversationId,
                    "method", "tools/call", "params", Map.of("name", definition.name(), "arguments", arguments));
            String response = client.post().uri(endpoint).headers(target -> headers.forEach(target::set))
                    .header("Accept", "application/json, text/event-stream").bodyValue(request).retrieve().bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(60)).block();
            if (response == null) return "MCP returned an empty response";
            return extractResult(response);
        } catch (Exception error) {
            return "MCP tool failed (" + transport + "): " + error.getMessage();
        }
    }

    private String extractResult(String response) {
        try {
            String data = response.lines().filter(line -> line.startsWith("data:"))
                    .map(line -> line.substring(5).trim()).findFirst().orElse(response.trim());
            JsonNode json = mapper.readTree(data);
            return json.has("error") ? json.get("error").toString() : json.path("result").toString();
        } catch (Exception ignored) {
            return response;
        }
    }
}
