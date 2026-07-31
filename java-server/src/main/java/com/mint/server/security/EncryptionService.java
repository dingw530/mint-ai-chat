package com.mint.server.security;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Reads and writes the Node AES-256-GCM format: iv:authTag:ciphertext, all hex. */
@Service
public class EncryptionService {
    private static final byte[] SALT = "ai-chat-salt".getBytes(StandardCharsets.UTF_8);
    private static final int KEY_LENGTH = 32;
    private final SecureRandom random = new SecureRandom();
    private final String encryptionKey;

    /** Creates an encryption service using the shared environment secret. */
    public EncryptionService(@Value("${mint.encryption.key:}") String encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    /** Decrypts an existing Node-format API key. */
    public String decrypt(String value) {
        try {
            String[] parts = value.split(":", -1);
            if (parts.length != 3) {
                throw new IllegalArgumentException("Invalid encrypted value format");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, HexFormat.of().parseHex(parts[0])));
            cipher.updateAAD(new byte[0]);
            byte[] ciphertextAndTag = concat(HexFormat.of().parseHex(parts[2]), HexFormat.of().parseHex(parts[1]));
            return new String(cipher.doFinal(ciphertextAndTag), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            throw new IllegalStateException("Unable to decrypt API key", error);
        }
    }

    /** Encrypts a value in the same format written by the Node service. */
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[16];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            byte[] ciphertextAndTag = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            int split = ciphertextAndTag.length - 16;
            HexFormat hex = HexFormat.of();
            return hex.formatHex(iv) + ":" + hex.formatHex(slice(ciphertextAndTag, split, 16)) + ":"
                    + hex.formatHex(slice(ciphertextAndTag, 0, split));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Unable to encrypt API key", error);
        }
    }

    private SecretKeySpec key() {
        if (encryptionKey == null || encryptionKey.isBlank()) {
            throw new IllegalStateException("AI_CHAT_ENCRYPTION_KEY is required");
        }
        return new SecretKeySpec(SCrypt.generate(encryptionKey.getBytes(StandardCharsets.UTF_8), SALT,
                16_384, 8, 1, KEY_LENGTH), "AES");
    }

    private byte[] concat(byte[] first, byte[] second) {
        byte[] result = new byte[first.length + second.length];
        System.arraycopy(first, 0, result, 0, first.length);
        System.arraycopy(second, 0, result, first.length, second.length);
        return result;
    }

    private byte[] slice(byte[] value, int offset, int length) {
        byte[] result = new byte[length];
        System.arraycopy(value, offset, result, 0, length);
        return result;
    }
}
