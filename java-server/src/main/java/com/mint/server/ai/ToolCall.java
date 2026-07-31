package com.mint.server.ai;

/** Completed model function call used to continue a ReAct round. */
public record ToolCall(String id, String name, String arguments) {
}
