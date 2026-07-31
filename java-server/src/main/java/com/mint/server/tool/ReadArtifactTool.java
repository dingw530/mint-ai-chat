package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Reads paginated JSON artifacts below the workspace context-artifacts directory. */
@Component
public class ReadArtifactTool implements Tool {
    private final WorkspaceGuard workspace;
    private final ObjectMapper mapper;
    public ReadArtifactTool(WorkspaceGuard workspace, ObjectMapper mapper) { this.workspace = workspace; this.mapper = mapper; }
    public String name() { return "read_artifact"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Read a JSON tool-result artifact within context-artifacts.", Map.of("type","object","properties",Map.of("path",Map.of("type","string"),"offset",Map.of("type","integer"),"max_chars",Map.of("type","integer")),"required",List.of("path"))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try {
            Path root = workspace.resolve("context-artifacts").toRealPath();
            Path requested = workspace.resolve(String.valueOf(arguments.getOrDefault("path", ""))).toRealPath();
            if (!requested.startsWith(root) || !requested.toString().toLowerCase().endsWith(".json") || !Files.isRegularFile(requested)) throw new SecurityException("artifact path is unsafe or missing");
            String content = Files.readString(requested, StandardCharsets.UTF_8);
            int offset = Math.max(0, Math.min(number(arguments.get("offset"), 0), content.length()));
            int max = Math.max(1, Math.min(number(arguments.get("max_chars"), 12000), 30000));
            int end = Math.min(content.length(), offset + max);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
            return mapper.writeValueAsString(Map.of("path", requested.toString(), "content", content.substring(offset, end), "offset", offset,
                    "totalChars", content.length(), "truncated", end < content.length(), "sha256", HexFormat.of().formatHex(digest)));
        } catch (Exception error) { return "Read artifact failed: " + error.getMessage(); }
    }
    private int number(Object value, int fallback) { try { return value == null ? fallback : Integer.parseInt(String.valueOf(value)); } catch (NumberFormatException ignored) { return fallback; } }
}
