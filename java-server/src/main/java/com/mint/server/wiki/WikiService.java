package com.mint.server.wiki;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.security.WorkspaceGuard;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** Reads and lists Wiki files within the container workspace. */
@Service
public class WikiService {
    private final WikiRepository repository;
    private final WikiCompilerService compiler;
    private final WikiIngestionService ingestion;
    private final WorkspaceGuard workspace;
    private final ObjectMapper mapper;

    /** Creates the Wiki filesystem service. */
    @Autowired
    public WikiService(WikiRepository repository, WikiCompilerService compiler, WikiIngestionService ingestion, WorkspaceGuard workspace, ObjectMapper mapper) {
        this.repository = repository;
        this.compiler = compiler;
        this.ingestion = ingestion;
        this.workspace = workspace;
        this.mapper = mapper;
    }

    /** Backward-compatible constructor used by focused filesystem tests. */
    public WikiService(WikiRepository repository, WorkspaceGuard workspace, ObjectMapper mapper) {
        this(repository, null, null, workspace, mapper);
    }

    /** Lists markdown and JSON Wiki files using the existing tree response shape. */
    public Map<String, Object> list() {
        Path root = root();
        try {
            Files.createDirectories(root);
            List<Map<String, Object>> tree = buildTree(root, root);
            return Map.of("tree", tree, "total", countFiles(tree));
        } catch (IOException error) {
            throw new IllegalStateException("Unable to list Wiki", error);
        }
    }

    /**
     * Builds the Node-compatible, recursively nested Wiki file tree.
     *
     * @param root Wiki root used to calculate relative paths
     * @param directory directory currently being traversed
     * @return sorted directory and file nodes
     * @throws IOException when the directory cannot be read
     */
    private List<Map<String, Object>> buildTree(Path root, Path directory) throws IOException {
        List<Path> entries;
        try (var paths = Files.list(directory)) {
            entries = paths.sorted(Comparator.comparing(path -> path.getFileName().toString())).toList();
        }
        List<Map<String, Object>> tree = new ArrayList<>();
        for (Path entry : entries) {
            if (Files.isDirectory(entry)) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("name", entry.getFileName().toString());
                node.put("type", "directory");
                node.put("path", root.relativize(entry).toString());
                node.put("modifiedAt", Files.getLastModifiedTime(entry).toMillis());
                node.put("children", buildTree(root, entry));
                tree.add(node);
            } else if (Files.isRegularFile(entry) && visibleFile(entry)) {
                tree.add(Map.of("name", entry.getFileName().toString(), "type", "file",
                        "path", root.relativize(entry).toString(),
                        "modifiedAt", Files.getLastModifiedTime(entry).toMillis()));
            }
        }
        return tree;
    }

    /**
     * Counts files recursively so directory nodes do not affect the Node-compatible total.
     *
     * @param tree tree nodes to inspect
     * @return visible file count
     */
    private int countFiles(List<Map<String, Object>> tree) {
        int count = 0;
        for (Map<String, Object> node : tree) {
            if ("file".equals(node.get("type"))) count++;
            Object children = node.get("children");
            if (children instanceof List<?> list) count += countFiles(nodes(list));
        }
        return count;
    }

    /** Reads one Wiki file after enforcing the workspace boundary. */
    public Map<String, Object> read(String relativePath) {
        Path root = root();
        Path path = root.resolve(relativePath == null ? "" : relativePath).normalize();
        if (!path.startsWith(root)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Wiki path is outside workspace");
        try {
            String content = Files.readString(path, StandardCharsets.UTF_8);
            return Map.of("content", content, "path", relativePath, "name", path.getFileName().toString(), "size", content.length());
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wiki file not found");
        }
    }

    /** Returns the configurable Wiki schema, falling back to the current default. */
    public Object schema() {
        Path schema = root().resolve("_schema.json");
        try { return Files.exists(schema) ? mapper.readValue(Files.readString(schema), Object.class) : defaultSchema(); }
        catch (Exception error) { return defaultSchema(); }
    }

    /** Updates the Wiki schema file inside the workspace. */
    public Object updateSchema(Object value) {
        Path root = root();
        try { Files.createDirectories(root); Files.writeString(root.resolve("_schema.json"), mapper.writeValueAsString(value)); return value; }
        catch (IOException | RuntimeException error) { throw new IllegalStateException("Unable to save Wiki schema", error); }
    }

    /** Adds a Wiki category to the persisted schema without duplicating it. */
    public Object addCategory(String category) {
        String value = category == null ? "" : category.trim();
        if (value.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "category is required");
        Map<String, Object> schema = schemaMap();
        List<Map<String, Object>> categories = categories(schema);
        if (categories.stream().noneMatch(item -> value.equals(item.get("name")))) {
            categories.add(new LinkedHashMap<>(Map.of("name", value, "definition", "", "include", "", "exclude", "")));
        }
        schema.put("categories", categories);
        return updateSchema(schema);
    }

    /** Removes a Wiki category from the persisted schema. */
    public Object removeCategory(String category) {
        Map<String, Object> schema = schemaMap();
        categories(schema).removeIf(item -> String.valueOf(item.get("name")).equals(category));
        return updateSchema(schema);
    }

    /** Returns lifecycle heat rows from the compatible SQLite table. */
    public Map<String, Object> heat(int limit) {
        List<Map<String, Object>> all = repository.heatRows();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalPages", all.size());
        summary.put("activePages", all.stream().filter(p -> "active".equals(p.get("status"))).count());
        summary.put("stalePages", all.stream().filter(p -> "stale".equals(p.get("status"))).count());
        summary.put("archivedPages", all.stream().filter(p -> "archived".equals(p.get("status"))).count());
        summary.put("totalAccesses", all.stream().mapToLong(p -> (long) number(p.get("access_count"))).sum());
        List<Map<String, Object>> pages = all.stream().filter(page -> !List.of("deleted", "superseded").contains(page.get("status")))
                .map(this::heatPage).sorted((left, right) -> {
                    int retention = Double.compare((Double) right.get("retentionScore"), (Double) left.get("retentionScore"));
                    return retention != 0 ? retention : Long.compare(((Number) right.get("accessCount")).longValue(), ((Number) left.get("accessCount")).longValue());
                })
                .limit(Math.max(1, Math.min(limit, 100))).toList();
        return Map.of("summary", summary, "pages", pages);
    }

    private Map<String, Object> heatPage(Map<String, Object> row) {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("id", row.get("id")); page.put("path", row.get("path")); page.put("title", row.get("title")); page.put("status", row.get("status"));
        page.put("accessCount", (long) number(row.get("access_count"))); page.put("confidence", number(row.get("confidence"))); page.put("importance", number(row.get("importance")));
        page.put("retentionScore", retention(number(row.get("confidence")), number(row.get("importance")), number(row.get("access_count")), (String) row.get("last_confirmed_at")));
        page.put("lastAccessedAt", row.get("last_accessed_at")); page.put("lastConfirmedAt", row.get("last_confirmed_at"));
        return page;
    }

    private double number(Object value) { return value instanceof Number number ? number.doubleValue() : 0; }

    private double retention(double confidence, double importance, double accesses, String confirmedAt) {
        double boundedConfidence = Math.max(0, Math.min(1, confidence));
        double boundedImportance = Math.max(0, Math.min(1, importance));
        double ageDays = 0;
        if (confirmedAt != null) {
            try { ageDays = Math.max(0, Duration.between(Instant.parse(confirmedAt), Instant.now()).toMillis() / 86_400_000d); }
            catch (RuntimeException ignored) { }
        }
        double freshness = Math.exp((-Math.log(2) * ageDays) / 180);
        double accessBoost = Math.min(0.2, Math.log1p(Math.max(0, accesses)) * 0.03);
        return Math.max(0, Math.min(1.2, boundedConfidence * boundedImportance * freshness + accessBoost));
    }

    /** Stores an uploaded Wiki file inside the configured workspace and creates a completed job. */
    public Mono<Map<String, Object>> upload(FilePart file) {
        return DataBufferUtils.join(file.content()).map(buffer -> {
            try {
                byte[] bytes = new byte[buffer.readableByteCount()];
                buffer.read(bytes);
                return saveUpload(file.filename(), bytes);
            } finally {
                DataBufferUtils.release(buffer);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /** Lists Wiki ingestion jobs. */
    public Map<String, Object> jobs(String status, int limit) {
        String suffix = status == null || status.isBlank() ? "" : " WHERE status=?";
        String sql = "SELECT id,file_name,file_size,status,progress,step,result,error,attempts,created_at,updated_at "
                + "FROM ingestion_jobs" + suffix + " ORDER BY created_at DESC LIMIT ?";
        List<Map<String, Object>> rows = repository.jobs(status, limit);
        rows.forEach(this::jobCamelCase);
        return Map.of("jobs", rows, "total", rows.size());
    }

    /** Gets one Wiki ingestion job. */
    public Map<String, Object> job(String id) {
        List<Map<String, Object>> rows = repository.job(id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wiki job not found");
        Map<String, Object> row = rows.get(0);
        jobCamelCase(row);
        return Map.of("job", row);
    }

    /** Applies a compatible cancel/retry action to one job. */
    public Map<String, Object> jobAction(String id, String action) {
        if ("cancel".equals(action)) {
            repository.cancel(id);
        } else if ("retry".equals(action)) {
            ingestion.retry(id);
        }
        return job(id);
    }

    private Path root() {
        String configured = repository.configuredPath();
        Path root = configured == null || configured.isBlank() ? workspace.root().resolve("wiki") : workspace.resolve(configured);
        if (!root.normalize().startsWith(workspace.root())) throw new SecurityException("Wiki path must stay within /workspace");
        return root.normalize();
    }

    private Map<String, Object> saveUpload(String filename, byte[] bytes) {
        String safeName = Path.of(filename == null ? "upload.bin" : filename).getFileName().toString();
        Path target = root().resolve(safeName).normalize();
        if (!target.startsWith(root())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Wiki upload path is outside workspace");
        try {
            Files.createDirectories(root());
            Files.write(target, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            String id = UUID.randomUUID().toString();
            String now = Instant.now().toString();
            String text = new String(bytes, StandardCharsets.UTF_8);
            String preview = text.substring(0, Math.min(text.length(), 500));
            Map<String,Object> resultData = new LinkedHashMap<>();
            resultData.put("sourceFile", safeName); resultData.put("format", extension(safeName)); resultData.put("textLength", text.length()); resultData.put("preview", preview);
            resultData.put("pages", List.of()); resultData.put("pageCount", 0);
            Map<String,Object> payload = new LinkedHashMap<>(); payload.put("path", safeName); payload.put("sourceFile", safeName);
            repository.insertJob(id, safeName, bytes.length, mapper.writeValueAsString(payload), now);
            if (ingestion != null) ingestion.schedule();
            return Map.of("jobId", id, "sourceFile", safeName, "fileName", safeName, "fileSize", bytes.length);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to save Wiki upload", error);
        }
    }

    private String extension(String filename) {
        int index = filename.lastIndexOf('.');
        return index < 0 ? "unknown" : filename.substring(index + 1);
    }

    private void jobCamelCase(Map<String, Object> row) {
        row.put("fileName", row.remove("file_name"));
        row.put("fileSize", row.remove("file_size"));
        if (row.containsKey("file_count")) row.put("fileCount", row.remove("file_count"));
        if (row.containsKey("source_type")) row.put("sourceType", row.remove("source_type"));
        if (row.containsKey("conversation_id")) row.put("conversationId", row.remove("conversation_id"));
        row.put("createdAt", row.remove("created_at"));
        row.put("updatedAt", row.remove("updated_at"));
        row.put("isTerminal", List.of("completed", "failed", "cancelled").contains(row.get("status")));
        Object result = row.get("result");
        if (result instanceof String value) {
            try { row.put("result", mapper.readValue(value, Object.class)); } catch (JsonProcessingException ignored) { }
        }
    }
    private boolean visibleFile(Path path) {
        String name = path.getFileName().toString();
        String normalized = name.toLowerCase();
        return !".gitkeep".equals(name) && (name.endsWith(".md") || "_schema.json".equals(name)
                || "_manifest.json".equals(name) || normalized.matches(".*\\.(html?|txt|pdf)$"));
    }

    /**
     * Creates defensive string-keyed map copies from tree child values.
     *
     * @param values raw child values
     * @return copied map nodes
     */
    private List<Map<String, Object>> nodes(List<?> values) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        values.stream().filter(Map.class::isInstance).map(Map.class::cast).forEach(node -> {
            Map<String, Object> copy = new LinkedHashMap<>();
            node.forEach((key, value) -> copy.put(String.valueOf(key), value));
            nodes.add(copy);
        });
        return nodes;
    }
    private Map<String, Object> defaultSchema() { return Map.of("categories", List.of()); }

    private Map<String, Object> schemaMap() {
        Object value = schema();
        if (value instanceof Map<?, ?> raw) {
            Map<String, Object> result = new LinkedHashMap<>();
            raw.forEach((key, item) -> result.put(String.valueOf(key), item));
            return result;
        }
        return new LinkedHashMap<>(defaultSchema());
    }

    private List<Map<String, Object>> categories(Map<String, Object> schema) {
        Object value = schema.get("categories");
        if (!(value instanceof List<?> list)) return new ArrayList<>();
        List<Map<String, Object>> result = new ArrayList<>();
        list.stream().filter(item -> item instanceof Map<?, ?>).forEach(item -> {
            Map<String, Object> category = new LinkedHashMap<>();
            ((Map<?, ?>) item).forEach((key, entry) -> category.put(String.valueOf(key), entry));
            result.add(category);
        });
        return result;
    }
}
