package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Writes text files only inside the workspace. */
@Component
public class WriteFileTool implements Tool {
    private final WorkspaceGuard workspace;
    public WriteFileTool(WorkspaceGuard workspace) { this.workspace = workspace; }
    public String name() { return "write_file"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Write a text file within the workspace.", Map.of("type", "object", "properties", Map.of("path", Map.of("type", "string"), "content", Map.of("type", "string")), "required", List.of("path", "content"))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try { Path path = workspace.resolve(String.valueOf(arguments.getOrDefault("path", ""))); String content = String.valueOf(arguments.getOrDefault("content", "")); Files.createDirectories(path.getParent() == null ? workspace.root() : path.getParent()); Files.writeString(path, content, StandardCharsets.UTF_8); return "File written: " + workspace.root().relativize(path); }
        catch (Exception error) { return "Write file failed: " + error.getMessage(); }
    }
}
