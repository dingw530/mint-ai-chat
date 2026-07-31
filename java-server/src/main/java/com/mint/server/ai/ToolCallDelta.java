package com.mint.server.ai;

/** Incremental function-call data normalized across AI provider protocols. */
public record ToolCallDelta(int index, String id, String name, String arguments) {
}
