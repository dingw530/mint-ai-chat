package com.mint.server.tool;

import static org.junit.jupiter.api.Assertions.assertSame;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Verifies runtime tool refresh cannot mutate an existing run snapshot. */
class ToolRegistrySnapshotTest {
    @Test
    void refreshDoesNotReplaceToolsInExistingSnapshot() {
        Tool first = new StubTool("first");
        Tool second = new StubTool("second");
        ToolRegistry registry = new ToolRegistry(List.of(first), new ObjectMapper());

        Map<String, Tool> snapshot = registry.snapshot();
        registry.replaceMcpTools(List.of(second));

        assertSame(first, snapshot.get("first"));
    }

    private record StubTool(String name) implements Tool {
        @Override
        public ToolDefinition definition() {
            return new ToolDefinition(name, "", Map.of("type", "object"));
        }

        @Override
        public String execute(Map<String, Object> arguments, String conversationId) {
            return name;
        }
    }
}
