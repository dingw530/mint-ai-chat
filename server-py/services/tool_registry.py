from __future__ import annotations

import json
from typing import Any

# 工具定义：遵循 OpenAI function calling 格式，`tool_choice="auto"` 时 AI 自主决定是否调用
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather_forecast",
            "description": "获取指定城市的天气预报，支持3天和7天预报",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市中文名称",
                    },
                    "days": {
                        "type": "integer",
                        "enum": [3, 7],
                        "description": "预报天数，默认3天",
                    },
                },
                "required": ["city"],
            },
        },
    }
]


async def execute_tool(tool_call: dict[str, Any]) -> Any:
    """执行 AI 请求的工具调用，目前仅支持天气查询

    在 tool path 流程中被 ai_proxy.py 调用：缓冲首轮 AI 响应 → 检测到工具调用 → 执行 → 二次请求。
    将 import 放在函数内部避免模块级循环依赖。
    """
    from services.qweather_service import get_city_location, get_weather_forecast

    name = tool_call.get("function", {}).get("name")
    args_raw = tool_call.get("function", {}).get("arguments", "{}")
    args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw

    if name == "get_weather_forecast":
        city = args.get("city")
        days = args.get("days", 3)
        locations = await get_city_location(city)
        if not locations:
            return {"error": f"未找到城市: {city}"}
        forecast = await get_weather_forecast(locations[0]["id"], days)
        return forecast

    return {"error": f"Unknown tool: {name}"}
