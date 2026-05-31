from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import repositories.settings_repository as repo
from services.encryption import encrypt, decrypt, mask_api_key
from schemas import SettingsInput, VisibleSettings


def _http_error(message: str, status: int) -> Exception:
    e = Exception(message)
    e.status_code = status
    return e


_DEFAULT_MODEL = "gpt-4o-mini"


def get() -> dict[str, Any]:
    """获取设置并脱敏 API 密钥后返回给前端"""
    raw = repo.get_all()
    api_key_plain = _decrypt_safe(raw.get("apiKey", ""))
    return VisibleSettings(
        api_url=raw.get("apiUrl", ""),
        api_key_masked=mask_api_key(api_key_plain),
        model_id=raw.get("modelId", ""),
        system_prompt=raw.get("systemPrompt", ""),
        thinking_mode=raw.get("thinkingMode", "false") == "true",
    ).model_dump_camel()


def get_ai_settings() -> dict[str, Any]:
    """返回含明文 API 密钥的设置，供 AI API 调用使用（不返回给前端）"""
    raw = repo.get_all()
    api_key = _decrypt_safe(raw.get("apiKey", ""))
    return {
        "apiUrl": raw.get("apiUrl", ""),
        "apiKey": api_key,
        "modelId": raw.get("modelId", _DEFAULT_MODEL),
        "systemPrompt": raw.get("systemPrompt", ""),
        "thinkingMode": raw.get("thinkingMode", "false") == "true",
    }


def save(input_data: SettingsInput) -> None:
    """保存设置：校验 URL → 加密 API 密钥 → 持久化"""
    if not input_data.api_url or not input_data.model_id:
        raise _http_error("apiUrl and modelId are required", 400)

    parsed = urlparse(input_data.api_url)
    if not parsed.scheme or not parsed.netloc:
        raise _http_error("apiUrl must be a valid URL", 400)

    if not input_data.api_key:
        raise _http_error("apiKey is required", 400)

    settings: dict[str, str] = {
        "apiUrl": input_data.api_url,
        "apiKey": encrypt(input_data.api_key),  # 加密后再存储，绝不保存明文
        "modelId": input_data.model_id,
        "systemPrompt": input_data.system_prompt or "",
        "thinkingMode": "true" if input_data.thinking_mode else "false",
    }
    repo.upsert_all(settings)


def _decrypt_safe(encrypted: str) -> str:
    """安全解密，解密失败时返回脱敏标记而非抛出异常"""
    if not encrypted:
        return ""
    try:
        return decrypt(encrypted)
    except Exception:
        return "****"
