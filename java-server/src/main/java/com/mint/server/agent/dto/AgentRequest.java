package com.mint.server.agent.dto;

import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for configurable Agent operations. */
@Getter
@Setter
@NoArgsConstructor
public class AgentRequest {
    private String name;
    private String description = "";
    private String type = "custom";
    private String systemPrompt;
    private List<String> mcpServerIds = List.of();
    private List<String> triggerKeywords = List.of();
    private Boolean available = true;
}
