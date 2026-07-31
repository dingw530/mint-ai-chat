package com.mint.server.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.security.dto.BashSecurityRequest;
import com.mint.server.security.dto.BashSecurityResponse;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores the user-configurable Bash deny lists in the existing settings table. */
@Service
public class BashSecurityService {
    private final BashSecurityRepository repository;
    private final ObjectMapper mapper;

    /** Creates the Bash security settings service. */
    public BashSecurityService(BashSecurityRepository repository, ObjectMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    /** Returns configured command and directory deny lists. */
    public BashSecurityResponse get() {
        return new BashSecurityResponse(read("bashBlockedCommands"), read("bashBlockedDirs"));
    }

    /** Replaces both deny lists atomically. */
    @Transactional
    public void update(BashSecurityRequest input) {
        try {
            write("bashBlockedCommands", input.getBlockedCommands());
            write("bashBlockedDirs", input.getBlockedDirs());
            // Transaction boundary is owned by the application service.
        } catch (RuntimeException error) {
            throw error;
        }
    }

    /** Returns true when a command or path matches a configured deny-list entry. */
    public boolean blocked(String command, String directory) {
        return read("bashBlockedCommands").stream().anyMatch(command::contains)
                || read("bashBlockedDirs").stream().anyMatch(value -> command.contains(value) || directory.contains(value));
    }

    private List<String> read(String key) {
        String value = repository.read(key);
        try { return mapper.readValue(value, new TypeReference<>() {}); }
        catch (JsonProcessingException error) { return List.of(); }
    }

    private void write(String key, Object value) {
        try {
            String json = mapper.writeValueAsString(value instanceof List<?> ? value : List.of());
            repository.replace(key, json);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("Invalid Bash security configuration", error);
        }
    }
}
