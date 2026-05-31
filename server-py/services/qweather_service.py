from __future__ import annotations

import os
import time
from typing import Any

import httpx
import jwt

_QBASE = "https://api.qweather.com"
_QBASE_GEO = "https://geoapi.qweather.com"

_token_cache: dict[str, Any] = {}
"""JWT 缓存：避免每次请求都重新签名，减少 EdDSA 计算开销"""


def _normalize_pem(pem: str) -> str:
    """规范化 PEM 格式：替换 \\n 换行，补充缺失的 PEM 头尾标记

    .env 文件中的换行可能被转义为 \\n，需要先还原。
    """
    cleaned = pem.replace("\\n", "\n")
    if "-----BEGIN" in cleaned:
        return cleaned
    return f"-----BEGIN PRIVATE KEY-----\n{cleaned}\n-----END PRIVATE KEY-----\n"


def _generate_token() -> str:
    """生成 QWeather JWT（EdDSA 签名）

    使用 Ed25519 私钥签发 JWT，payload 包含 project_id 作为 sub。
    iat 提前 30 秒避免时钟偏差，exp 设为 15 分钟（QWeather 要求）。
    """
    project_id = os.environ["QWEATHER_PROJECT_ID"]
    key_id = os.environ["QWEATHER_KEY_ID"]
    private_key_pem = _normalize_pem(os.environ["QWEATHER_PRIVATE_KEY"])

    now = int(time.time())
    payload = {
        "sub": project_id,
        "iat": now - 30,
        "exp": now + 900,
    }
    headers_dict = {"kid": key_id}

    return jwt.encode(payload, private_key_pem, algorithm="EdDSA", headers=headers_dict)


def _ensure_token() -> str:
    """获取缓存的 JWT，过期前 60 秒自动刷新

    每次 API 调用都重新签发 JWT 没有必要，利用缓存减少签名次数。
    """
    token = _token_cache.get("token")
    expires_at = _token_cache.get("expires_at", 0)
    if token and time.time() < expires_at - 60:
        return token
    _token_cache["token"] = _generate_token()
    _token_cache["expires_at"] = time.time() + 900
    return _token_cache["token"]


async def _qfetch(path: str, base_url: str = _QBASE) -> Any:
    """向 QWeather API 发起认证请求，自动注入 Bearer JWT"""
    token = _ensure_token()
    url = f"{base_url}{path}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        return resp.json()


async def get_city_location(city_name: str) -> list[Any]:
    data = await _qfetch(f"/v2/city/lookup?location={city_name}", _QBASE_GEO)
    return data.get("location", [])


async def get_weather_forecast(location_id: str, days: int = 3) -> list[Any]:
    data = await _qfetch(f"/v7/weather/{days}d?location={location_id}", _QBASE)
    return data.get("daily", [])
