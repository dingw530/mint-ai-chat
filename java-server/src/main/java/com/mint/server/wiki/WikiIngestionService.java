package com.mint.server.wiki;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.security.WorkspaceGuard;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Service;

/** Executes persisted Wiki ingestion jobs asynchronously and supports restart recovery. */
@Service
public class WikiIngestionService {
    private final WikiRepository repository;
    private final WikiCompilerService compiler;
    private final WorkspaceGuard workspace;
    private final ObjectMapper mapper;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean draining = new AtomicBoolean();

    public WikiIngestionService(WikiRepository repository, WikiCompilerService compiler,
                                WorkspaceGuard workspace, ObjectMapper mapper) {
        this.repository = repository;
        this.compiler = compiler;
        this.workspace = workspace;
        this.mapper = mapper;
    }

    /** Recovers queued and interrupted jobs after application startup. */
    @PostConstruct
    public void recover() { schedule(); }

    /** Wakes the worker after a new job is persisted. */
    public void schedule() {
        if (draining.compareAndSet(false, true)) executor.submit(() -> {
            try { drain(); } finally { draining.set(false); }
        });
    }

    /** Persists model-supplied source text as a chat ingestion job. */
    public Map<String,Object> enqueueText(String title, String text, String conversationId) {
        String safe = (title == null || title.isBlank() ? "untitled" : title).replaceAll("[^\\p{L}\\p{N}._-]+", "-");
        if (!safe.toLowerCase().endsWith(".md")) safe += ".md";
        Path root = wikiRoot();
        try {
            Files.createDirectories(root);
            Path target = root.resolve(safe).normalize();
            if (!target.startsWith(root)) throw new SecurityException("Wiki source path is outside workspace");
            Files.writeString(target, text == null ? "" : text, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            String id = UUID.randomUUID().toString(); String now = Instant.now().toString();
            Map<String,Object> payload = new LinkedHashMap<>(); payload.put("path", safe); payload.put("sourceFile", safe);
            repository.insertJob(id, "chat", conversationId, safe, (text == null ? "" : text).getBytes(StandardCharsets.UTF_8).length, mapper.writeValueAsString(payload), now);
            schedule();
            return Map.of("jobId", id, "sourceFile", safe, "fileName", safe, "status", "queued");
        } catch (Exception error) { throw new IllegalStateException("Unable to enqueue Wiki source", error); }
    }

    /** Requeues one failed or cancelled job. */
    public void retry(String jobId) {
        repository.updateJob(jobId, "queued", 0, "等待处理", null, null);
        schedule();
    }

    private void drain() {
        List<Map<String,Object>> jobs = repository.pendingJobs();
        for (Map<String,Object> job : jobs) process(job);
    }

    private void process(Map<String,Object> job) {
        String id = String.valueOf(job.get("id"));
        try {
            repository.updateJob(id, "processing", 10, "读取来源", null, null);
            Map<String,Object> payload = mapper.readValue(String.valueOf(job.getOrDefault("payload", "{}")), Map.class);
            String relativePath = String.valueOf(payload.getOrDefault("path", job.get("file_name")));
            Path root = wikiRoot();
            Path source = root.resolve(relativePath).normalize();
            if (!source.startsWith(root) || !Files.isRegularFile(source)) throw new IllegalArgumentException("Wiki source does not exist");
            String text = Files.readString(source, StandardCharsets.UTF_8);
            repository.updateJob(id, "processing", 45, "编译知识页", null, null);
            List<Map<String,Object>> pages = compiler.compile(root, relativePath, text);
            Map<String,Object> result = Map.of("sourceFile", relativePath, "pageCount", pages.size(), "pages", pages);
            repository.updateJob(id, "completed", 100, "完成", mapper.writeValueAsString(result), null);
        } catch (Exception error) {
            repository.updateJob(id, "failed", 100, "失败", null,
                    error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
        }
    }

    private Path wikiRoot() {
        String configured = repository.configuredPath();
        Path root = configured == null || configured.isBlank() ? workspace.root().resolve("wiki") : workspace.resolve(configured);
        if (!root.normalize().startsWith(workspace.root())) throw new SecurityException("Wiki path must stay within /workspace");
        return root.normalize();
    }
}
