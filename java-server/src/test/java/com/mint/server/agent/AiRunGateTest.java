package com.mint.server.agent;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AiRunGateTest {
    /** Enforces one active run per conversation while allowing independent conversations. */
    @Test
    void isolatesConversationRuns() {
        var gate = new AiRunGate(2);

        assertThat(gate.tryAcquire("a")).isTrue();
        assertThat(gate.tryAcquire("a")).isFalse();
        assertThat(gate.tryAcquire("b")).isTrue();
        assertThat(gate.tryAcquire("c")).isFalse();
        gate.release("a");
        assertThat(gate.tryAcquire("c")).isTrue();
    }

    /** Enforces the product-level maximum of twelve simultaneous AI runs. */
    @Test
    void allowsAtMostTwelveGlobalRuns() {
        var gate = new AiRunGate(12);

        for (int index = 0; index < 12; index++) {
            assertThat(gate.tryAcquire("conversation-" + index)).isTrue();
        }
        assertThat(gate.tryAcquire("conversation-13")).isFalse();
    }
}
