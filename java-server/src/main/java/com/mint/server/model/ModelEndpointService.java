package com.mint.server.model;

import com.mint.server.model.dto.ModelEndpointRequest;
import com.mint.server.model.dto.ModelEndpointResponse;
import com.mint.server.security.EncryptionService;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Application service for model endpoint configuration and activation. */
@Service
public class ModelEndpointService {
    private final ModelEndpointRepository repository;
    private final EncryptionService encryption;

    /** Creates the endpoint service. */
    public ModelEndpointService(ModelEndpointRepository repository, EncryptionService encryption) {
        this.repository = repository;
        this.encryption = encryption;
    }

    /** Lists configured endpoints with masked keys. */
    public List<ModelEndpointResponse> list() {
        return repository.findAll().stream().map(this::response).toList();
    }

    /** Creates an endpoint and makes the first endpoint active. */
    public ModelEndpointResponse create(ModelEndpointRequest input) {
        String name = required(input.getName(), "name");
        String url = required(input.getApiUrl(), "apiUrl");
        String model = required(input.getModelId(), "modelId");
        URI.create(url);
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        String category = input.getCategory() == null ? "text" : input.getCategory();
        String apiType = input.getApiType() == null ? "openai-chat" : input.getApiType();
        validateType(category, apiType);
        int count = repository.count();
        repository.insert(new ModelEndpoint(id, name, url, encrypted(input.getApiKey()), model, apiType, category, count == 0, count, now, now));
        return find(id);
    }

    /** Updates endpoint fields while retaining the old encrypted key if omitted. */
    public ModelEndpointResponse update(String id, ModelEndpointRequest input) {
        if (repository.findAll().stream().noneMatch(item -> id.equals(item.getId()))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Endpoint not found");
        String name = required(input.getName(), "name");
        String url = required(input.getApiUrl(), "apiUrl");
        String model = required(input.getModelId(), "modelId");
        String category = input.getCategory() == null ? "text" : input.getCategory();
        String apiType = input.getApiType() == null ? "openai-chat" : input.getApiType();
        validateType(category, apiType);
        String key = input.getApiKey() != null && !input.getApiKey().isBlank()
                ? encryption.encrypt(input.getApiKey()) : null;
        ModelEndpoint current = repository.findAll().stream().filter(item -> id.equals(item.getId())).findFirst().orElseThrow();
        repository.update(new ModelEndpoint(id, name, url, key == null ? current.getEncryptedApiKey() : key, model, apiType, category, current.isActive(), current.getSortOrder(), current.getCreatedAt(), Instant.now().toString()), key != null);
        return find(id);
    }

    /** Deletes an endpoint but preserves the existing invariant that one remains. */
    public void delete(String id) {
        int count = repository.count();
        if (count <= 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one endpoint is required");
        if (repository.delete(id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Endpoint not found");
        }
    }

    /** Activates one endpoint atomically. */
    @Transactional
    public void activate(String id) {
        if (repository.findAll().stream().noneMatch(item -> id.equals(item.getId()))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Endpoint not found");
        repository.activate(id, Instant.now().toString());
    }

    private ModelEndpointResponse find(String id) {
        return repository.findAll().stream().filter(item -> id.equals(item.getId())).map(this::response).findFirst().orElseThrow();
    }

    private ModelEndpointResponse findOrNull(String id) {
        return repository.findAll().stream().filter(item -> id.equals(item.getId())).map(this::response).findFirst().orElse(null);
    }

    private ModelEndpointResponse response(ModelEndpoint endpoint) { return new ModelEndpointResponse(endpoint.getId(), endpoint.getName(), endpoint.getApiUrl(), mask(endpoint.getEncryptedApiKey()), endpoint.getModelId(), endpoint.getApiType(), endpoint.getCategory(), endpoint.isActive(), endpoint.getSortOrder(), endpoint.getCreatedAt(), endpoint.getUpdatedAt()); }

    private String required(String value, String key) {
        String actual = value == null ? "" : value.trim();
        if (actual.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        return actual;
    }

    private String encrypted(String key) {
        return key == null || key.isBlank() ? "" : encryption.encrypt(key);
    }

    private void validateType(String category, String apiType) {
        if (!category.equals("text") && !category.equals("image")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid category");
        }
        if (!List.of("openai-chat", "openai-responses", "anthropic").contains(apiType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid apiType");
        }
    }

    private String mask(String encrypted) {
        if (encrypted == null || encrypted.isBlank()) return "";
        try {
            String value = encryption.decrypt(encrypted);
            return value.length() < 6 ? "****" : value.substring(0, 3) + "****" + value.substring(value.length() - 1);
        } catch (RuntimeException error) {
            return "****";
        }
    }
}
