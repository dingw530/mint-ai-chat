package com.mint.server.chat.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for the existing streaming chat endpoint. */
@Getter
@Setter
@NoArgsConstructor
public class ChatRequest {
    private String content;
    private String agent;
    private Boolean regenerate;
    private Object files;
    private Object control;
}
