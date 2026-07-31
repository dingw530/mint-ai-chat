package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Fetches public HTTP(S) resources with bounded output. */
@Component
public class HttpFetchTool implements Tool {
    private final WebClient.Builder clientBuilder;
    public HttpFetchTool(WebClient.Builder clientBuilder) { this.clientBuilder = clientBuilder; }
    public String name() { return "http_fetch"; }
    public ToolDefinition definition() { return new ToolDefinition(name(), "Fetch a public HTTP or HTTPS URL.", Map.of("type", "object", "properties", Map.of("url", Map.of("type", "string"), "method", Map.of("type", "string")), "required", List.of("url"))); }
    public String execute(Map<String,Object> arguments, String conversationId) {
        try { URI uri = URI.create(String.valueOf(arguments.getOrDefault("url", ""))); if (!List.of("http", "https").contains(uri.getScheme())) return "Only HTTP(S) URLs are allowed"; if (uri.getHost() == null || isPrivate(uri.getHost())) return "Private and local hosts are not allowed"; String value = clientBuilder.build().get().uri(uri).retrieve().bodyToMono(String.class).block(); return value == null ? "" : value.substring(0, Math.min(20000, value.length())); }
        catch (Exception error) { return "HTTP fetch failed: " + error.getMessage(); }
    }
    private boolean isPrivate(String host) { String value=host.toLowerCase(); return value.equals("localhost") || value.equals("127.0.0.1") || value.equals("::1") || value.startsWith("10.") || value.startsWith("192.168.") || value.startsWith("172.16.") || value.startsWith("172.17.") || value.startsWith("172.18.") || value.startsWith("172.19.") || value.startsWith("172.2"); }
}
