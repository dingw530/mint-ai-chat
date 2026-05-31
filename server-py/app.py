from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from routes.conversations import router as conversations_router
from routes.messages import router as messages_router
from routes.settings import router as settings_router
from routes.agents import router as agents_router
from routes.weather import router as weather_router

app = FastAPI(title="Mint AI Chat API (Python)")

# CORS: 允许所有来源，与前端 Vite dev server 跨域通信
# 生产环境应考虑限制具体的 origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由，路径前缀已在各 router 中定义（如 /api/conversations）
app.include_router(conversations_router)
app.include_router(messages_router)
app.include_router(settings_router)
app.include_router(agents_router)
app.include_router(weather_router)


# ─── 全局异常处理 ──────────────────────────────────────────────


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Pydantic 校验失败时返回统一错误格式"""
    return JSONResponse(status_code=400, content={"error": "Invalid request body"})


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    """全局兜底异常处理，提取业务异常中自定义的 status_code"""
    status = getattr(exc, "status_code", 500)
    return JSONResponse(
        status_code=status,
        content={"error": str(exc)},
    )
