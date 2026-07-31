package com.mint.server.wiki;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.model.ModelEndpoint;
import com.mint.server.model.ModelEndpointRepository;
import com.mint.server.security.EncryptionService;
import com.mint.server.graph.GraphRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

/** Compiles uploaded Wiki sources into searchable Markdown knowledge pages. */
@Service
public class WikiCompilerService {
    private final ModelEndpointRepository endpoints;
    private final EncryptionService encryption;
    private final WikiRepository repository;
    private final ObjectMapper mapper;
    private final WebClient.Builder clientBuilder;
    private final GraphRepository graph;

    /** Creates the Wiki compiler. */
    public WikiCompilerService(ModelEndpointRepository endpoints, EncryptionService encryption, WikiRepository repository,
                               ObjectMapper mapper, WebClient.Builder clientBuilder, GraphRepository graph) {
        this.endpoints = endpoints; this.encryption = encryption; this.repository = repository; this.mapper = mapper; this.clientBuilder = clientBuilder; this.graph = graph;
    }

    /** Generates pages with the configured model and persists their search entries. */
    public List<Map<String,Object>> compile(Path root, String sourceName, String sourceText) {
        List<Map<String,Object>> pages = requestPages(sourceName, sourceText);
        if (pages.isEmpty()) pages = List.of(Map.of("title", sourceName, "category", "concepts", "content", sourceText));
        List<Map<String,Object>> result = new ArrayList<>();
        Map<String,String> graphNodes = new LinkedHashMap<>();
        for (Map<String,Object> page : pages) {
            String title = text(page.get("title"), sourceName).replaceFirst("(?i)\\.(md|txt)$", "");
            String category = safeCategory(text(page.get("category"), "concepts"));
            String content = text(page.get("content"), sourceText);
            String filename = slug(title) + ".md";
            Path directory = root.resolve("pages").resolve(category);
            try {
                Files.createDirectories(directory);
                Path target = directory.resolve(filename);
                Files.writeString(target, content, StandardCharsets.UTF_8);
                String relative = root.relativize(target).toString().replace('\\', '/');
                repository.indexMarkdown(relative, title, content);
                Map<String,Object> graphNode = graph.createNode(Map.of("label", title, "type", graphType(category), "sourceFile", relative));
                graphNodes.put(title, String.valueOf(graphNode.get("id")));
                result.add(Map.of("filename", relative, "title", title, "category", category, "size", content.length()));
            } catch (IOException error) { throw new IllegalStateException("Unable to write compiled Wiki page", error); }
        }
        for (Map<String,Object> page : pages) {
            String source = text(page.get("title"), sourceName);
            String sourceId = graphNodes.get(source);
            if (sourceId == null) continue;
            String content = text(page.get("content"), sourceText);
            for (String target : linkedTitles(content, graphNodes.keySet())) graph.createEdge(Map.of("sourceId", sourceId, "relation", "相关", "targetId", graphNodes.get(target), "source", "auto-extracted"));
        }
        return result;
    }

    private List<Map<String,Object>> requestPages(String sourceName, String sourceText) {
        ModelEndpoint endpoint = endpoints.activeText().orElse(null);
        if (endpoint == null || endpoint.getEncryptedApiKey() == null || endpoint.getEncryptedApiKey().isBlank()) return List.of();
        try {
            String instruction="将输入资料整理为知识库页面。只返回 JSON：{\"pages\":[{\"title\":\"标题\",\"category\":\"concepts|practices|methodologies\",\"content\":\"Markdown正文\"}]}。保留事实，不要编造。";
            Map<String,Object> body = new LinkedHashMap<>(); body.put("model", endpoint.getModelId()); body.put("stream", false);
            body.put("messages", List.of(Map.of("role", "system", "content", instruction), Map.of("role", "user", "content", "来源：" + sourceName + "\n\n" + sourceText)));
            if (!"anthropic".equals(endpoint.getApiType())) body.put("response_format", Map.of("type", "json_object")); else { body.remove("stream"); body.put("max_tokens", 4096); body.put("system", instruction); body.put("messages", List.of(Map.of("role", "user", "content", "来源：" + sourceName + "\n\n" + sourceText))); }
            String key = encryption.decrypt(endpoint.getEncryptedApiKey());
            String raw = clientBuilder.build().post().uri(normalize(endpoint.getApiUrl(), "anthropic".equals(endpoint.getApiType()) ? "/v1/messages" : "/v1/chat/completions")).headers(h -> { if ("anthropic".equals(endpoint.getApiType())) { h.set("x-api-key", key); h.set("anthropic-version", "2023-06-01"); } else h.setBearerAuth(key); }).bodyValue(body).retrieve().bodyToMono(String.class).block();
            JsonNode root = mapper.readTree(raw == null ? "{}" : raw); String content = "anthropic".equals(endpoint.getApiType()) ? root.path("content").path(0).path("text").asText("") : root.path("choices").path(0).path("message").path("content").asText("");
            JsonNode pages = mapper.readTree(stripFence(content)).path("pages");
            List<Map<String,Object>> result = new ArrayList<>(); if (pages.isArray()) pages.forEach(page -> { Map<String,Object> value=new LinkedHashMap<>(); value.put("title",page.path("title").asText(sourceName)); value.put("category",page.path("category").asText("concepts")); value.put("content",page.path("content").asText(sourceText)); result.add(value); }); return result;
        } catch (Exception ignored) { return List.of(); }
    }

    private String stripFence(String value) { String result=value.trim(); if (result.startsWith("```")) result=result.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", ""); return result; }
    private String text(Object value,String fallback) { return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value); }
    private String safeCategory(String value) { String normalized=value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", ""); return List.of("concepts","practices","methodologies").contains(normalized) ? normalized : "concepts"; }
    private String graphType(String category) { return "practices".equals(category) ? "practice" : "methodologies".equals(category) ? "methodology" : "concept"; }
    private String slug(String value) { String result=value.trim().replaceFirst("(?i)\\.(md|txt)$", "").replaceAll("[^\\p{L}\\p{N}._-]+", "-"); return result.isBlank() ? "untitled" : result.substring(0, Math.min(100,result.length())); }
    private String normalize(String base,String path){String value=base.replaceAll("/+\\z","");return value.endsWith(path)?value:value.endsWith("/v1")?value+path.substring(3):value+path;}
    private List<String> linkedTitles(String content, java.util.Set<String> titles) { List<String> result=new ArrayList<>(); java.util.regex.Matcher matcher=java.util.regex.Pattern.compile("\\[\\[([^\\]]+)\\]\\]").matcher(content); while(matcher.find()){String value=matcher.group(1).trim(); if(titles.contains(value)) result.add(value);} return result; }
}
