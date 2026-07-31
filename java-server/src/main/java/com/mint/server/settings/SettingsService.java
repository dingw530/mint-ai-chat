package com.mint.server.settings;

import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import com.mint.server.settings.dto.SettingsRequest;
import com.mint.server.settings.dto.SettingsResponse;
import java.net.URI;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Application service for typed runtime settings and model configuration. */
@Service
public class SettingsService {
    private final SettingsRepository repository;
    private final ModelEndpointRepository endpoints;
    private final EncryptionService encryption;

    /** Creates the settings service. */
    public SettingsService(SettingsRepository repository, ModelEndpointRepository endpoints, EncryptionService encryption) {
        this.repository = repository;
        this.endpoints = endpoints;
        this.encryption = encryption;
    }

    /** Returns visible settings without exposing API keys. */
    public SettingsResponse get() {
        Map<String, String> raw = raw();
        ModelEndpoint active = endpoints.activeText().orElse(null);
        return new SettingsResponse(raw.getOrDefault("apiUrl", ""), mask(raw.get("apiKey")),
                raw.getOrDefault("modelId", ""), raw.getOrDefault("systemPrompt", ""), bool(raw, "thinkingMode", false),
                bool(raw, "memoryEnabled", false), raw.getOrDefault("routingMode", "auto"), integer(raw, "reactMaxIterations", 5),
                integer(raw, "toolMaxRetries", 5), bool(raw, "showReactSteps", true), integer(raw, "maxContextRounds", 10),
                active == null ? null : active.id(), active == null ? null : active.name(), raw.getOrDefault("wikiPath", ""),
                integer(raw, "wikiMaxFileSize", 10_485_760));
    }

    /** Validates and atomically saves settings using existing field names. */
    @Transactional
    public void save(SettingsRequest input) {
        String apiUrl = required(input.getApiUrl(), "apiUrl");
        String modelId = required(input.getModelId(), "modelId");
        URI.create(apiUrl);
        Map<String, String> values = new LinkedHashMap<>();
        values.put("apiUrl", apiUrl);
        values.put("modelId", modelId);
        values.put("systemPrompt", value(input.getSystemPrompt(), ""));
        values.put("thinkingMode", booleanValue(input.getThinkingMode(), false));
        values.put("memoryEnabled", booleanValue(input.getMemoryEnabled(), false));
        values.put("routingMode", value(input.getRoutingMode(), "auto"));
        values.put("reactMaxIterations", integerValue(input.getReactMaxIterations(), 5));
        values.put("toolMaxRetries", integerValue(input.getToolMaxRetries(), 5));
        values.put("showReactSteps", booleanValue(input.getShowReactSteps(), true));
        values.put("maxContextRounds", integerValue(input.getMaxContextRounds(), 10));
        values.put("wikiPath", value(input.getWikiPath(), ""));
        values.put("wikiMaxFileSize", integerValue(input.getWikiMaxFileSize(), 10_485_760));
        String apiKey = value(input.getApiKey(), "");
        if (!apiKey.isBlank()) values.put("apiKey", encryption.encrypt(apiKey));
        repository.save(values);
        repository.updateActiveEndpoint(apiUrl, apiKey.isBlank() ? null : encryption.encrypt(apiKey), modelId, Instant.now().toString());
    }

    /** Returns the current system prompt for a request-level configuration snapshot. */
    public String systemPrompt() { return raw().getOrDefault("systemPrompt", ""); }
    /** Returns whether active memories should be included in chat context. */
    public boolean memoryEnabled() { return bool(raw(), "memoryEnabled", false); }
    /** Returns the configured maximum ReAct rounds. */
    public int reactMaxIterations() { return integer(raw(), "reactMaxIterations", 5); }

    private Map<String, String> raw() {
        return repository.findAll();
    }
    private String required(String value, String key) { if (value == null || value.isBlank()) throw new IllegalArgumentException(key + " is required"); return value; }
    private String value(String value, String fallback) { return value == null ? fallback : value; }
    private String booleanValue(Boolean value, boolean fallback) { return String.valueOf(value == null ? fallback : value); }
    private String integerValue(Integer value, int fallback) { return String.valueOf(value == null ? fallback : value); }
    private String mask(String encrypted) { if (encrypted == null || encrypted.isBlank()) return ""; try { String value = encryption.decrypt(encrypted); return value.length() < 6 ? "****" : value.substring(0, 3) + "****" + value.substring(value.length() - 1); } catch (RuntimeException error) { return "****"; } }
    private boolean bool(Map<String, String> raw, String key, boolean fallback) { return raw.containsKey(key) ? Boolean.parseBoolean(raw.get(key)) : fallback; }
    private int integer(Map<String, String> raw, String key, int fallback) { try { return Integer.parseInt(raw.getOrDefault(key, String.valueOf(fallback))); } catch (NumberFormatException ignored) { return fallback; } }
}
