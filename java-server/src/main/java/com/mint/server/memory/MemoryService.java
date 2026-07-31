package com.mint.server.memory;

import com.mint.server.memory.dto.MemoryRequest;
import com.mint.server.memory.dto.MemoryResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Application service for typed memory CRUD and active-memory lookup. */
@Service
public class MemoryService {
    private final MemoryRepository repository;

    /** Creates the memory service. */
    public MemoryService(MemoryRepository repository) { this.repository = repository; }

    /** Lists active memories, optionally filtered by category. */
    public List<MemoryResponse> list(String category) {
        return repository.findActive(category);
    }

    /** Creates a memory using the existing default metadata. */
    public MemoryResponse create(MemoryRequest input) {
        String content = input.getContent() == null ? "" : input.getContent().trim();
        if (content.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "内容不能为空");
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        repository.insert(id, content, input.getCategory() == null ? "general" : input.getCategory(), input.getSourceConversationId(), now);
        return find(id);
    }

    /** Updates editable memory fields. */
    public MemoryResponse update(String id, MemoryRequest input) {
        MemoryResponse existing = find(id);
        String content = input.getContent() == null ? existing.getContent() : input.getContent();
        String category = input.getCategory() == null ? existing.getCategory() : input.getCategory();
        repository.update(id, content, category, Instant.now().toString());
        return find(id);
    }

    /** Soft-deletes a memory, preserving compatibility with lifecycle queries. */
    public void delete(String id) {
        repository.softDelete(id, Instant.now().toString());
    }

    private MemoryResponse find(String id) {
        return repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "记忆不存在"));
    }
}
