package com.mint.server.conversation;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.List;

/** Public message entity matching the existing API. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Message {
    private String id;
    private String conversationId;
    private String role;
    private String content;
    private String reasoning;
    private String imageData;
    private String createdAt;
    private List<UiBlock> uiBlocks;
}
