package com.mint.server.mcp.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** MCP server list envelope. */
@Getter
@AllArgsConstructor
public class McpServerListResponse {
    private List<McpServerResponse> servers;
}
