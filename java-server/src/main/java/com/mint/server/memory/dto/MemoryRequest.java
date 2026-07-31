package com.mint.server.memory.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for memory create/update operations. */
@Getter
@Setter
@NoArgsConstructor
public class MemoryRequest {
    private String content;
    private String category = "general";
    private String sourceConversationId;
}
