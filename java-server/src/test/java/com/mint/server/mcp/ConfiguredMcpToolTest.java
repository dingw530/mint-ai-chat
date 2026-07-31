package com.mint.server.mcp;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

/** Verifies direct MCP tools/call handling for JSON and HTTP/SSE responses. */
class ConfiguredMcpToolTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void parsesStreamableHttpJsonResponseWithoutDiscovery() throws IOException {
        AtomicBoolean discoveryCalled = new AtomicBoolean();
        startServer("application/json", "{\"jsonrpc\":\"2.0\",\"result\":{\"content\":[{\"text\":\"json-ok\"}]}}", discoveryCalled);

        String result = tool("streamable-http").execute(Map.of("value", 1), "run-1");

        assertTrue(result.contains("json-ok"));
        assertTrue(!discoveryCalled.get());
    }

    @Test
    void parsesHttpSseDataResponseWithoutDiscovery() throws IOException {
        AtomicBoolean discoveryCalled = new AtomicBoolean();
        startServer("text/event-stream", "event: message\ndata: {\"jsonrpc\":\"2.0\",\"result\":{\"content\":[{\"text\":\"sse-ok\"}]}}\n\n", discoveryCalled);

        String result = tool("sse").execute(Map.of(), "run-2");

        assertTrue(result.contains("sse-ok"));
        assertTrue(!discoveryCalled.get());
    }

    private ConfiguredMcpTool tool(String transport) {
        return new ConfiguredMcpTool("local", "http://127.0.0.1:" + server.getAddress().getPort() + "/mcp",
                transport, new ToolDefinition("echo", "", Map.of("type", "object")), Map.of("X-Test", "yes"),
                WebClient.builder().build(), new ObjectMapper());
    }

    private void startServer(String contentType, String response, AtomicBoolean discoveryCalled) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/mcp", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (body.contains("tools/list")) discoveryCalled.set(true);
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        });
        server.start();
    }
}
