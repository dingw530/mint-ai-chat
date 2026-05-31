import os
import pytest
from services.encryption import encrypt, decrypt, mask_api_key

TEST_KEY = "4b41d0b24a2f922485f2f728f113b8b83e599755a98555bf28d90dff93352da5"


def setup_module():
    os.environ["AI_CHAT_ENCRYPTION_KEY"] = TEST_KEY


class TestEncryption:

    def test_encrypt_returns_hex_string(self):
        result = encrypt("test-api-key")
        # Format: hex:hex:hex
        parts = result.split(":")
        assert len(parts) == 3
        assert len(parts[0]) == 32  # 16 bytes IV = 32 hex chars
        assert len(parts[1]) == 32  # 16 bytes auth tag = 32 hex chars
        assert len(parts[2]) > 0

    def test_decrypt_roundtrip(self):
        plaintext = "sk-test-api-key-12345"
        encrypted = encrypt(plaintext)
        decrypted = decrypt(encrypted)
        assert decrypted == plaintext

    def test_different_ciphertexts_same_plaintext(self):
        """Same plaintext produces different ciphertext due to random IV."""
        plaintext = "sk-test-key"
        encrypted1 = encrypt(plaintext)
        encrypted2 = encrypt(plaintext)
        assert encrypted1 != encrypted2
        assert decrypt(encrypted1) == plaintext
        assert decrypt(encrypted2) == plaintext

    def test_empty_string(self):
        plaintext = ""
        encrypted = encrypt(plaintext)
        assert decrypt(encrypted) == ""

    def test_special_characters_and_unicode(self):
        plaintext = "hello@#$%^&*()_+{}|:\"<>?~`-=[]\\;',./世界🚀"
        encrypted = encrypt(plaintext)
        assert decrypt(encrypted) == plaintext

    def test_long_string(self):
        plaintext = "a" * 4096
        encrypted = encrypt(plaintext)
        assert decrypt(encrypted) == plaintext

    def test_common_api_key_prefixes(self):
        for prefix in ["sk-", "pk-", "sk-ant-"]:
            key = prefix + "testkey12345"
            encrypted = encrypt(key)
            decrypted = decrypt(encrypted)
            assert decrypted == key


class TestDecryptionSecurity:

    def test_tampered_ciphertext_detection(self):
        plaintext = "sk-test-api-key"
        encrypted = encrypt(plaintext)
        parts = encrypted.split(":")
        # Tamper with the ciphertext part
        tampered = parts[0] + ":" + parts[1] + ":" + "00" * len(parts[2])
        with pytest.raises(Exception):
            decrypt(tampered)

    def test_decrypt_empty_string_throws(self):
        with pytest.raises(Exception):
            decrypt("")

    def test_decrypt_invalid_hex_throws(self):
        with pytest.raises(Exception):
            decrypt("invalid:format:test")

    def test_error_message_no_plaintext_leak(self):
        """Error messages should not leak the original key."""
        plaintext = "sk-super-secret-key-12345"
        encrypted = encrypt(plaintext)
        parts = encrypted.split(":")
        tampered = parts[0] + ":" + parts[1] + ":" + "00" * (len(parts[2]) // 2)
        try:
            decrypt(tampered)
        except Exception as e:
            msg = str(e)
            assert "sk-" not in msg
            assert plaintext not in msg
            assert "super-secret" not in msg


class TestMaskApiKey:

    def test_mask_short_key(self):
        assert mask_api_key("abc") == "****"

    def test_mask_empty_key(self):
        assert mask_api_key("") == "****"

    def test_mask_none_key(self):
        assert mask_api_key("") == "****"

    def test_mask_standard_key(self):
        masked = mask_api_key("sk-test-api-key-12345")
        assert masked == "sk-" + "****" + "5"
        assert len(masked) < len("sk-test-api-key-12345")

    def test_mask_exactly_6_chars(self):
        masked = mask_api_key("abcdef")
        assert masked == "abc" + "****" + "f"
