package com.mint.server.conversation;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Public conversation entity matching the existing camelCase API. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Conversation {
    private String id;
    private String title;
    private String type;
    private String createdAt;
    private String updatedAt;
    private String lockedAgent;
    private String routingMode;

    /** Keeps the internal value-style accessor while callers migrate to JavaBean getters. */
    public String id() { return id; }
}
