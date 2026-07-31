package com.mint.server.wiki;

import com.mint.server.wiki.dto.WikiCategoryRequest;
import java.util.Map;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import reactor.core.publisher.Mono;

/** Wiki browsing and schema endpoints matching the existing client. */
@RestController
@RequestMapping("/api/wiki")
public class WikiController {
    private final WikiService service;

    /** Creates the Wiki controller. */
    public WikiController(WikiService service) { this.service = service; }
    /** Lists Wiki files. */
    @GetMapping("/list") public Map<String, Object> list() { return service.list(); }
    /** Reads one Wiki file. */
    @GetMapping("/read") public Map<String, Object> read(@RequestParam String path) { return service.read(path); }
    /** Gets Wiki schema. */
    @GetMapping("/schema") public Object schema() { return service.schema(); }
    /** Updates Wiki schema. */
    @PutMapping("/schema") public Object updateSchema(@RequestBody Object body) { return service.updateSchema(body); }
    /** Adds a schema category. */
    @PostMapping("/categories") public Object addCategory(@RequestBody WikiCategoryRequest body) { return service.addCategory(body.getCategory()); }
    /** Removes a schema category. */
    @DeleteMapping("/categories/{category}") public Object removeCategory(@PathVariable String category) { return service.removeCategory(category); }
    /** Gets Wiki heat data. */
    @GetMapping("/heat") public Map<String, Object> heat(@RequestParam(defaultValue = "30") int limit) { return service.heat(limit); }
    /** Accepts one Wiki file upload. */
    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public Mono<Map<String, Object>> upload(@RequestPart("file") FilePart file) { return service.upload(file); }
    /** Lists Wiki ingestion jobs. */
    @GetMapping("/jobs") public Map<String, Object> jobs(@RequestParam(required = false) String status, @RequestParam(defaultValue = "100") int limit) { return service.jobs(status, Math.max(1, Math.min(limit, 500))); }
    /** Gets one Wiki ingestion job. */
    @GetMapping("/jobs/{jobId}") public Map<String, Object> job(@PathVariable String jobId) { return service.job(jobId); }
    /** Cancels one pending Wiki ingestion job. */
    @PostMapping("/jobs/{jobId}/cancel") public Map<String, Object> cancel(@PathVariable String jobId) { return service.jobAction(jobId, "cancel"); }
    /** Retries one Wiki ingestion job. */
    @PostMapping("/jobs/{jobId}/retry") public Map<String, Object> retry(@PathVariable String jobId) { return service.jobAction(jobId, "retry"); }
}
