package com.mint.server.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HealthControllerTest {

    /** Verifies the local health contract used by Docker smoke checks. */
    @Test
    void returnsHealthyStatus() {
        var response = new HealthController().health();

        assertThat(response).containsEntry("status", "ok");
        assertThat(response).containsEntry("service", "mint-java-server");
    }
}
