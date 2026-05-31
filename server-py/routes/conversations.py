from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from schemas import ConversationCreate, ConversationRename
import services.conversation_service as service

router = APIRouter()


@router.get("/api/conversations")
def list_conversations():
    """获取对话列表，返回格式: {"conversations": [...]}"""
    try:
        convs = service.list_all()
        return {"conversations": convs}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/api/conversations", status_code=201)
def create_conversation(body: ConversationCreate):
    """创建新对话，body 可选 title 字段"""
    try:
        conv = service.create(body.title)
        return {"conversation": conv}
    except Exception as e:
        status = getattr(e, "status_code", 500)
        return JSONResponse(status_code=status, content={"error": str(e)})


@router.delete("/api/conversations/{id}")
def delete_conversation(id: str):
    """删除对话（级联删除所有消息）"""
    try:
        result = service.remove(id)
        return result
    except Exception as e:
        status = getattr(e, "status_code", 500)
        return JSONResponse(status_code=status, content={"error": str(e)})


@router.patch("/api/conversations/{id}")
def rename_conversation(id: str, body: ConversationRename):
    """重命名对话"""
    try:
        conv = service.rename(id, body.title)
        return {"conversation": conv}
    except Exception as e:
        status = getattr(e, "status_code", 500)
        return JSONResponse(status_code=status, content={"error": str(e)})
