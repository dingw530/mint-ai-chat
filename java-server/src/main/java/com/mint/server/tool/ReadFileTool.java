package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Reads a bounded text file within the workspace. */
@Component
public class ReadFileTool implements Tool {
    private final WorkspaceGuard workspace;
    public ReadFileTool(WorkspaceGuard workspace) { this.workspace = workspace; }
    public String name() { return "read_file"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Read a text file within the workspace.", Map.of("type", "object", "properties", Map.of("path", Map.of("type", "string")), "required", List.of("path"))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try { Path path = workspace.resolveExisting(String.valueOf(arguments.getOrDefault("path", ""))); String value = Files.readString(path, StandardCharsets.UTF_8); return value.length() > 20000 ? value.substring(0, 20000) + "\n[truncated]" : value; }
        catch (Exception error) { return "Read file failed: " + error.getMessage(); }
    }
}
