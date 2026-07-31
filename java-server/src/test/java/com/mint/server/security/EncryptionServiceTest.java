package com.mint.server.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EncryptionServiceTest {
    /** Verifies decryption of a fixture produced by Node crypto.scryptSync + AES-GCM. */
    @Test
    void decryptsExistingNodeCiphertext() {
        var service = new EncryptionService("compat-key");

        assertThat(service.decrypt("07070707070707070707070707070707:bdbe86bb0afc2de82bfb4e5ef9538d0b:b478e733aef161f845fd4a0b"))
                .isEqualTo("secret-value");
    }

    /** Verifies newly encrypted values retain the three-part format and round trip. */
    @Test
    void encryptsAndDecryptsRoundTrip() {
        var service = new EncryptionService("compat-key");
        String encrypted = service.encrypt("round-trip");

        assertThat(encrypted.split(":")).hasSize(3);
        assertThat(service.decrypt(encrypted)).isEqualTo("round-trip");
    }
}
