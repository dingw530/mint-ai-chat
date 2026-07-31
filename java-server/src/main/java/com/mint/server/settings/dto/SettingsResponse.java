package com.mint.server.settings.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Public runtime settings response; API keys are masked. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SettingsResponse {
    private String apiUrl;
    private String apiKeyMasked;
    private String modelId;
    private String systemPrompt;
    private boolean thinkingMode;
    private boolean memoryEnabled;
    private String routingMode;
    private int reactMaxIterations;
    private int toolMaxRetries;
    private boolean showReactSteps;
    private int maxContextRounds;
    private String activeEndpointId;
    private String activeEndpointName;
    private String wikiPath;
    private int wikiMaxFileSize;
}
