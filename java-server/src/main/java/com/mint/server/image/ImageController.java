package com.mint.server.image;

import java.util.Map;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** HTTP endpoints for image generation and image conversations. */
@RestController
@RequestMapping("/api")
public class ImageController {
    private final ImageService service;

    /** Creates the image controller. */
    public ImageController(ImageService service) { this.service = service; }

    /** Generates an image without persisting a conversation. */
    @PostMapping("/images/generate")
    public Map<String, Object> generate(@RequestBody ImageRequest request) {
        return service.generate(request.getEndpointId(), request.getPrompt(), request.getSize(), request.getQuality(), request.getOutputFormat());
    }

    /** Sends a prompt to an image conversation and persists both messages. */
    @PostMapping("/conversations/{id}/images")
    public Map<String, Object> send(@PathVariable String id, @RequestBody ImageMessageRequest request) {
        return service.sendMessage(id, request.getEndpointId(), request.getContent(), request.getSize(), request.getQuality(), request.getOutputFormat());
    }

    /** Image generation request. */
    public static class ImageRequest {
        private String endpointId;
        private String prompt;
        private String size;
        private String quality;
        @JsonProperty("output_format")
        private String outputFormat;
        public String getEndpointId() { return endpointId; }
        public void setEndpointId(String endpointId) { this.endpointId = endpointId; }
        public String getPrompt() { return prompt; }
        public void setPrompt(String prompt) { this.prompt = prompt; }
        public String getSize() { return size; }
        public void setSize(String size) { this.size = size; }
        public String getQuality() { return quality; }
        public void setQuality(String quality) { this.quality = quality; }
        public String getOutputFormat() { return outputFormat; }
        public void setOutputFormat(String outputFormat) { this.outputFormat = outputFormat; }
    }

    /** Image conversation request. */
    public static class ImageMessageRequest extends ImageRequest {
        public String getContent() { return getPrompt(); }
        public void setContent(String content) { setPrompt(content); }
    }
}
