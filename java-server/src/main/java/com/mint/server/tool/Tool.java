package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import java.util.Map;

/** Executable tool contract shared by built-in and configured MCP tools. */
public interface Tool {
    /** Returns the unique model-facing name. */
    String name();

    /** Returns the provider-facing schema. */
    ToolDefinition definition();

    /** Executes validated JSON object arguments. */
    String execute(Map<String, Object> arguments, String conversationId);
}
