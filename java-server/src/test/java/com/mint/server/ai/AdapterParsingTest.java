package com.mint.server.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** Verifies provider-specific stream events preserve tool calls and usage. */
class AdapterParsingTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void responsesOutputItemCarriesFunctionNameBeforeArgumentDeltas() throws Exception {
        ExposedResponsesAdapter adapter = new ExposedResponsesAdapter();
        AiChunk chunk = adapter.parse(mapper.readTree("""
                {"type":"response.output_item.added","output_index":0,
                 "item":{"type":"function_call","id":"fc_1","name":"bash","arguments":""}}
                """));

        assertNotNull(chunk.toolCall());
        assertEquals("fc_1", chunk.toolCall().id());
        assertEquals("bash", chunk.toolCall().name());
    }

    @Test
    void anthropicMessageStartPreservesInputUsage() throws Exception {
        ExposedAnthropicAdapter adapter = new ExposedAnthropicAdapter();
        AiChunk chunk = adapter.parse(mapper.readTree("""
                {"type":"message_start","message":{"usage":{"input_tokens":17,"output_tokens":0}}}
                """));

        assertEquals(17, chunk.inputTokens());
        assertEquals(0, chunk.outputTokens());
    }

    private static final class ExposedResponsesAdapter extends OpenAiResponsesAdapter {
        private ExposedResponsesAdapter() {
            super(WebClientBuilders.builder(), new ObjectMapper());
        }

        private AiChunk parse(JsonNode json) {
            return parseJson(json);
        }
    }

    private static final class ExposedAnthropicAdapter extends AnthropicAdapter {
        private ExposedAnthropicAdapter() {
            super(WebClientBuilders.builder(), new ObjectMapper());
        }

        private AiChunk parse(JsonNode json) {
            return parseJson(json);
        }
    }

    private static final class WebClientBuilders {
        private static org.springframework.web.reactive.function.client.WebClient.Builder builder() {
            return org.springframework.web.reactive.function.client.WebClient.builder();
        }
    }
}
