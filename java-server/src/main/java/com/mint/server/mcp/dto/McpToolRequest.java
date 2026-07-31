package com.mint.server.mcp.dto;

import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Settings-page MCP tool definition; inputSchema remains dynamic JSON Schema. */
@Getter
@Setter
@NoArgsConstructor
public class McpToolRequest {
    private String name;
    private String description = "";
    private Map<String, Object> inputSchema = Map.of();
    private String transport = "streamable-http";
}
