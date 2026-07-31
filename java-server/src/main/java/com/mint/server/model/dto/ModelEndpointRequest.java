package com.mint.server.model.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for model endpoint create/update operations. */
@Getter
@Setter
@NoArgsConstructor
public class ModelEndpointRequest {
    private String name;
    private String apiUrl;
    private String apiKey;
    private String modelId;
    private String apiType = "openai-chat";
    private String category = "text";
}
