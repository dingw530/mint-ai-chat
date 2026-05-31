from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services.tool_registry import execute_tool

router = APIRouter()


@router.get("/api/weather/query")
async def query_weather(
    city: str = Query(..., description="城市名称"),
    days: int = Query(3, description="预报天数"),
):
    """直接调用天气查询工具（非 AI 对话模式下的独立接口）

    复用 execute_tool 逻辑，便于前端直接获取天气数据而不必经过 AI 对话流程。
    """
    if not city:
        return JSONResponse(
            status_code=400, content={"error": "Missing required parameter: city"}
        )
    if days not in (3, 7):
        return JSONResponse(
            status_code=400, content={"error": "days must be 3 or 7"}
        )

    try:
        forecast = await execute_tool(
            {
                "function": {
                    "name": "get_weather_forecast",
                    "arguments": f'{{"city": "{city}", "days": {days}}}',
                }
            }
        )
        return {"city": city, "days": days, "forecast": forecast}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
