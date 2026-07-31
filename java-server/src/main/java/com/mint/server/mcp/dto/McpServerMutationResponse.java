package com.mint.server.mcp.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** MCP server mutation envelope. */
@Getter
@AllArgsConstructor
public class McpServerMutationResponse {
    private McpServerResponse server;
}
