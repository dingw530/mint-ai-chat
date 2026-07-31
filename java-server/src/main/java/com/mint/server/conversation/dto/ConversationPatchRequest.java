package com.mint.server.conversation.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for conversation rename or agent locking. */
@Getter
@Setter
@NoArgsConstructor
public class ConversationPatchRequest {
    private String title;
    private String lockedAgent;

    /** Preserves the existing null-versus-absent request behavior. */
    public boolean lockedAgentPresent() {
        return lockedAgent != null || title == null;
    }
}
