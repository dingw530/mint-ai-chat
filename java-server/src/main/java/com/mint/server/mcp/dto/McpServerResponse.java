package com.mint.server.mcp.dto;

import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** Persisted MCP server and its directly registered tools. */
@Getter
@AllArgsConstructor
public class McpServerResponse {
    private String id;
    private String name;
    private String command;
    private Object args;
    private Map<String, Object> env;
    private String url;
    private Map<String, Object> headers;
    private String status;
    private String errorMessage;
    private String createdAt;
    private String updatedAt;
    private List<McpToolResponse> tools;
}
