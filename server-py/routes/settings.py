from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from schemas import SettingsInput
import services.settings_service as service

router = APIRouter()


@router.get("/api/settings")
def get_settings():
    """获取设置（API 密钥以脱敏形式返回）"""
    try:
        return service.get()
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.put("/api/settings")
def save_settings(body: SettingsInput):
    """保存设置（API 密钥加密后存储）"""
    try:
        service.save(body)
        return {"success": True}
    except Exception as e:
        status = getattr(e, "status_code", 500)
        return JSONResponse(status_code=status, content={"error": str(e)})
