package com.mint.server.conversation;

import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Persisted A2UI business block attached to an assistant message. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UiBlock {
    private String id;
    private String messageId;
    private int blockIndex;
    private int textOffset;
    private String kind;
    private int version;
    private Map<String,Object> data;
    private String createdAt;
    private String updatedAt;
}
