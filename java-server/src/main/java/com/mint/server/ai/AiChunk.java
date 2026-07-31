package com.mint.server.ai;

/** Normalized provider stream event consumed by the chat/ReAct layer. */
public record AiChunk(String content, String reasoning, ToolCallDelta toolCall,
                      Integer inputTokens, Integer outputTokens, boolean finished) {
    /** Creates a text chunk. */
    public static AiChunk text(String content) {
        return new AiChunk(content, null, null, null, null, false);
    }

    /** Creates a reasoning chunk. */
    public static AiChunk reasoning(String reasoning) {
        return new AiChunk(null, reasoning, null, null, null, false);
    }

    /** Creates a terminal chunk. */
    public static AiChunk terminal() {
        return new AiChunk(null, null, null, null, null, true);
    }

    /** Creates a tool-call delta. */
    public static AiChunk tool(ToolCallDelta delta) {
        return new AiChunk(null, null, delta, null, null, false);
    }

    /** Creates a normalized provider usage event. */
    public static AiChunk usage(int inputTokens, int outputTokens) {
        return new AiChunk(null, null, null, inputTokens, outputTokens, false);
    }

    /** Creates a terminal event carrying optional provider usage. */
    public static AiChunk terminal(Integer inputTokens, Integer outputTokens) {
        return new AiChunk(null, null, null, inputTokens, outputTokens, true);
    }
}
