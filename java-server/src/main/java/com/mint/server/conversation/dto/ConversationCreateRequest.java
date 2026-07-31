package com.mint.server.conversation.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for conversation creation. */
@Getter
@Setter
@NoArgsConstructor
public class ConversationCreateRequest {
    private String title;
    private String type;
}
