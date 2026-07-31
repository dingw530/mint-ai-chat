package com.mint.server.mcp.dto;

import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Settings-page MCP server configuration. */
@Getter
@Setter
@NoArgsConstructor
public class McpServerRequest {
    private String name;
    private String url;
    private Map<String, String> headers = Map.of();
    private List<McpToolRequest> tools = List.of();
}
