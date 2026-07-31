package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import com.mint.server.skill.SkillService;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Loads a local Markdown Skill into the model context. */
@Component
public class SkillTool implements Tool {
    private final WorkspaceGuard workspace;
    private final SkillService skills;
    public SkillTool(WorkspaceGuard workspace, SkillService skills) { this.workspace = workspace; this.skills = skills; }
    public String name() { return "invoke_skill"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Load a Markdown skill from the skills directory.", Map.of("type", "object", "properties", Map.of("name", Map.of("type", "string"), "path", Map.of("type", "string")), "required", List.of("name"))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try { String requested=String.valueOf(arguments.getOrDefault("name", arguments.getOrDefault("path", ""))); String value=skills.read(requested); return value.length()>30000 ? value.substring(0,30000)+"\n[truncated]" : value; }
        catch(Exception error) { return "Skill load failed: " + error.getMessage(); }
    }
}
