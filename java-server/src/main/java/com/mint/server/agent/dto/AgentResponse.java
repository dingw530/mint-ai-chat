package com.mint.server.agent.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Public Agent response DTO. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AgentResponse {
    private String id;
    private String name;
    private String label;
    private String description;
    private String type;
    private String systemPrompt;
    private List<String> toolIds;
    private List<String> mcpServerIds;
    private boolean available;
    private String errorMessage;
    private List<String> triggerKeywords;
    private String createdAt;
    private String updatedAt;
}
