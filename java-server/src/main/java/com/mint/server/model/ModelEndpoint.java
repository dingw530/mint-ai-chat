package com.mint.server.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Configured AI model endpoint entity read from the existing model_endpoints table. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ModelEndpoint {
    private String id;
    private String name;
    private String apiUrl;
    private String encryptedApiKey;
    private String modelId;
    private String apiType;
    private String category;
    private boolean active;
    private int sortOrder;
    private String createdAt;
    private String updatedAt;

    public String id() { return id; }
    public String name() { return name; }
    public String apiUrl() { return apiUrl; }
    public String encryptedApiKey() { return encryptedApiKey; }
    public String modelId() { return modelId; }
    public String apiType() { return apiType; }
    public String category() { return category; }
    public boolean active() { return active; }
}
