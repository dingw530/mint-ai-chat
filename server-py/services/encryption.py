import os
import sys
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key() -> bytes:
    """从环境变量读取加密密钥，通过 scrypt 派生为 32 字节 AES 密钥

    使用 scrypt 替代直接哈希，增加暴力破解成本。
    参数 (n=16384, r=8, p=1) 与 Node.js crypto.scryptSync 默认值一致。
    """
    key = os.environ.get("AI_CHAT_ENCRYPTION_KEY")
    if not key:
        print("FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is required", file=sys.stderr)
        sys.exit(1)
    return hashlib.scrypt(
        key.encode("utf-8"),
        salt=b"ai-chat-salt",
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )


def encrypt(plaintext: str) -> str:
    """使用 AES-256-GCM 加密明文

    返回格式: {iv_hex}:{auth_tag_hex}:{ciphertext_hex}
    AESGCM.encrypt 返回 ciphertext + auth_tag，需要拆开存储。
    """
    key = _get_key()
    iv = os.urandom(16)
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    # AESGCM.encrypt 返回的是密文 + 认证标签（标签在最后 16 字节）
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    return f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"


def decrypt(encrypted_text: str) -> str:
    """解密 AES-256-GCM 密文

    输入格式: {iv_hex}:{auth_tag_hex}:{ciphertext_hex}
    先将拆开的认证标签拼回密文尾部，再调用 decrypt。
    """
    key = _get_key()
    parts = encrypted_text.split(":")
    iv = bytes.fromhex(parts[0])
    auth_tag = bytes.fromhex(parts[1])
    ciphertext = bytes.fromhex(parts[2])
    ct_with_tag = ciphertext + auth_tag
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct_with_tag, None).decode("utf-8")


def mask_api_key(api_key: str) -> str:
    """脱敏 API 密钥，只保留前 3 位和后 1 位，中间用 **** 代替"""
    if not api_key or len(api_key) < 6:
        return "****"
    return api_key[:3] + "****" + api_key[-1:]
