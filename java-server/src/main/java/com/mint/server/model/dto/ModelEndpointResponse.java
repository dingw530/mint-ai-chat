package com.mint.server.model.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Public model endpoint response DTO; encrypted keys never leave the service. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ModelEndpointResponse {
    private String id;
    private String name;
    private String apiUrl;
    private String apiKeyMasked;
    private String modelId;
    private String apiType;
    private String category;
    private boolean isActive;
    private int sortOrder;
    private String createdAt;
    private String updatedAt;
}
