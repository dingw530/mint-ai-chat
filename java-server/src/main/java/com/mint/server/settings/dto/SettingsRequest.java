package com.mint.server.settings.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** HTTP request DTO for runtime settings updates. */
@Getter
@Setter
@NoArgsConstructor
public class SettingsRequest {
    private String apiUrl;
    private String apiKey;
    private String modelId;
    private String systemPrompt;
    private Boolean thinkingMode;
    private Boolean memoryEnabled;
    private String routingMode;
    private Integer reactMaxIterations;
    private Integer toolMaxRetries;
    private Boolean showReactSteps;
    private Integer maxContextRounds;
    private String wikiPath;
    private Integer wikiMaxFileSize;
}
