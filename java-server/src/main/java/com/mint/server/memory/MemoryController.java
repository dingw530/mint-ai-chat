package com.mint.server.memory;

import com.mint.server.memory.dto.MemoryRequest;
import com.mint.server.memory.dto.MemoryResponse;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Existing memories CRUD endpoints. */
@RestController
@RequestMapping("/api/memories")
public class MemoryController {
    private final MemoryService service;

    /** Creates the memory controller. */
    public MemoryController(MemoryService service) {
        this.service = service;
    }

    /** Lists active memories. */
    @GetMapping({"", "/"})
    public List<MemoryResponse> list(@RequestParam(required = false) String category) {
        return service.list(category);
    }

    /** Creates a memory. */
    @PostMapping({"", "/"})
    public MemoryResponse create(@RequestBody MemoryRequest body) {
        return service.create(body);
    }

    /** Updates a memory. */
    @PutMapping("/{id}")
    public MemoryResponse update(@PathVariable String id, @RequestBody MemoryRequest body) {
        return service.update(id, body);
    }

    /** Soft-deletes a memory. */
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        service.delete(id);
        return Map.of("success", true);
    }
}
