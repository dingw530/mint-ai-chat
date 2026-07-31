package com.mint.server.memory.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Public memory response DTO. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class MemoryResponse {
    private String id;
    private String content;
    private String category;
    private String memoryKey;
    private String memoryType;
    private String subject;
    private double confidence;
    private double importance;
    private String status;
    private String sourceConversationId;
    private String createdAt;
    private String updatedAt;
}
