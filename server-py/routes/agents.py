from __future__ import annotations

import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/agents")
def list_agents():
    """返回可用的 agent 列表及其可用状态

    天气 agent 仅在三个 QWeather 环境变量全部配置时才标记为可用，
    前端据此控制天气按钮的启用/禁用状态。
    """
    weather_available = bool(
        os.environ.get("QWEATHER_PROJECT_ID")
        and os.environ.get("QWEATHER_KEY_ID")
        and os.environ.get("QWEATHER_PRIVATE_KEY")
    )
    return {
        "agents": [
            {"id": "general", "label": "通用助手", "available": True},
            {"id": "weather", "label": "和风天气", "available": weather_available},
        ]
    }
