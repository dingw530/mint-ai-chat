package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Lists files below the container workspace. */
@Component
public class ListFilesTool implements Tool {
    private final WorkspaceGuard workspace;
    private final ObjectMapper mapper;
    public ListFilesTool(WorkspaceGuard workspace, ObjectMapper mapper) { this.workspace = workspace; this.mapper = mapper; }
    public String name() { return "list_files"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "List files within the workspace.", Map.of("type", "object", "properties", Map.of("path", Map.of("type", "string")))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try (var paths = Files.list(workspace.resolve(String.valueOf(arguments.getOrDefault("path", ""))))) {
            List<Map<String,Object>> result = new ArrayList<>();
            paths.sorted(Comparator.comparing(Path::toString)).limit(200).forEach(path -> result.add(Map.of("path", workspace.root().relativize(path).toString(), "directory", Files.isDirectory(path))));
            return mapper.writeValueAsString(result);
        } catch (Exception error) { return "List files failed: " + error.getMessage(); }
    }
}
