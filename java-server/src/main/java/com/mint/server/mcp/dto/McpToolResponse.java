package com.mint.server.mcp.dto;

import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** Persisted MCP tool definition exposed to the settings client. */
@Getter
@AllArgsConstructor
public class McpToolResponse {
    private String name;
    private String description;
    private Map<String, Object> inputSchema;
    private String transport;
}
