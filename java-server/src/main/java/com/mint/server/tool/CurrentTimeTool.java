package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Returns the current UTC time. */
@Component
public class CurrentTimeTool implements Tool {
    public String name() { return "get_current_time"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Get the current UTC time.", Map.of("type", "object", "properties", Map.of())); }
    public String execute(Map<String,Object> arguments, String conversationId) { return OffsetDateTime.now(ZoneOffset.UTC).toString(); }
}
