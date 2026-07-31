package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Explicit registry for built-in tools; MCP tools are added by the runtime config layer. */
@Component
public class ToolRegistry {
    private final Map<String, Tool> tools = new ConcurrentHashMap<>();
    private final ObjectMapper mapper;

    /** Creates a registry from Spring-discovered built-in tools. */
    public ToolRegistry(List<Tool> tools, ObjectMapper mapper) {
        tools.forEach(tool -> this.tools.put(tool.name(), tool));
        this.mapper = mapper;
    }

    /** Returns definitions passed to the model. */
    public List<ToolDefinition> definitions() {
        return definitions(snapshot());
    }

    /** Returns an immutable run-level snapshot of registered tool instances. */
    public Map<String, Tool> snapshot() {
        return Map.copyOf(tools);
    }

    /** Returns provider definitions for one immutable run-level snapshot. */
    public List<ToolDefinition> definitions(Map<String, Tool> snapshot) {
        return snapshot.values().stream().map(Tool::definition).toList();
    }

    /** Replaces all runtime MCP tools after a settings update. */
    public void replaceMcpTools(List<Tool> mcpTools) {
        tools.entrySet().removeIf(entry -> entry.getValue().getClass().getSimpleName().equals("ConfiguredMcpTool"));
        mcpTools.forEach(tool -> tools.put(tool.name(), tool));
    }

    /** Executes a tool call after decoding its JSON arguments. */
    public String execute(String name, String arguments, String conversationId) {
        return execute(snapshot(), name, arguments, conversationId);
    }

    /** Executes a tool from the supplied run-level snapshot. */
    public String execute(Map<String, Tool> snapshot, String name, String arguments, String conversationId) {
        Tool tool = snapshot.get(name);
        if (tool == null) return "Tool not found: " + name;
        try {
            Map<String, Object> input = mapper.readValue(arguments == null || arguments.isBlank() ? "{}" : arguments,
                    mapper.getTypeFactory().constructMapType(Map.class, String.class, Object.class));
            return tool.execute(input, conversationId);
        } catch (Exception error) {
            return "Tool execution failed: " + error.getMessage();
        }
    }

    /** Returns the user-facing approval reason for side-effecting tools. */
    public String approvalReason(String name, Map<String,Object> arguments) {
        if ("bash".equals(name)) return "Bash 命令可能修改工作区或执行外部副作用";
        if ("write_file".equals(name)) return "写入文件会修改工作区内容";
        if (name != null && name.contains("__")) return "MCP 工具可能产生外部副作用";
        return null;
    }
}
