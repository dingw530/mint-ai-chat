package com.mint.server.ai;

import java.util.Map;

/** JSON-schema tool definition passed to provider adapters. */
public record ToolDefinition(String name, String description, Map<String, Object> parameters) {
}
