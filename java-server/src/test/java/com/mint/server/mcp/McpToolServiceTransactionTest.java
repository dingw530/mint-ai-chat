package com.mint.server.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.mint.server.mcp.dto.McpServerRequest;
import com.mint.server.mcp.dto.McpServerResponse;
import com.mint.server.mcp.dto.McpToolRequest;

/** Verifies invalid MCP updates roll back persisted definitions. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {"AI_CHAT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "SERVER_ADDRESS=127.0.0.1"})
class McpToolServiceTransactionTest {
    private static final Path DB = Path.of(System.getProperty("java.io.tmpdir"),
            "mint-mcp-transaction-" + UUID.randomUUID() + ".db");

    @Autowired
    private McpToolService service;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("AI_CHAT_DB_PATH", () -> DB.toString());
    }

    @AfterAll
    static void cleanup() throws Exception {
        Files.deleteIfExists(DB);
        Files.deleteIfExists(Path.of(DB + "-wal"));
        Files.deleteIfExists(Path.of(DB + "-shm"));
    }

    @Test
    void invalidUpdateKeepsPreviousServerAndToolDefinitions() {
        McpToolRequest oldTool = new McpToolRequest();
        oldTool.setName("old-tool");
        oldTool.setInputSchema(Map.of("type", "object"));
        McpServerRequest createRequest = new McpServerRequest();
        createRequest.setName("rollback-server");
        createRequest.setUrl("http://127.0.0.1:1");
        createRequest.setTools(List.of(oldTool));
        McpServerResponse created = service.create(createRequest);
        String id = created.getId();

        McpToolRequest invalidTool = new McpToolRequest();
        invalidTool.setName("old-tool");
        McpToolRequest duplicateTool = new McpToolRequest();
        duplicateTool.setName("old-tool");
        McpServerRequest invalidRequest = new McpServerRequest();
        invalidRequest.setName("rollback-server");
        invalidRequest.setUrl("http://127.0.0.1:2");
        invalidRequest.setTools(List.of(invalidTool, duplicateTool));
        assertThrows(IllegalArgumentException.class, () -> service.update(id, invalidRequest));

        McpServerResponse persisted = service.list().stream()
                .filter(server -> id.equals(server.getId())).findFirst().orElseThrow();
        assertEquals("http://127.0.0.1:1", persisted.getUrl());
        assertEquals("old-tool", persisted.getTools().get(0).getName());
    }
}
