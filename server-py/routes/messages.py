from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from schemas import MessageCreate
import services.message_service as service

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # 禁止 Nginx 缓冲 SSE 流
}


@router.get("/api/conversations/{id}/messages")
def get_messages(id: str):
    """获取对话的所有历史消息，按创建时间升序排列"""
    try:
        msgs = service.get_messages(id)
        return {"messages": msgs}
    except Exception as e:
        status = getattr(e, "status_code", 500)
        return JSONResponse(status_code=status, content={"error": str(e)})


@router.post("/api/conversations/{id}/messages")
async def send_message(id: str, body: MessageCreate):
    """发送消息并以 SSE 流式返回 AI 回复

    前端通过 EventSource 或 fetch + ReadableStream 消费此接口。
    StreamingResponse 保持 HTTP 长连接，逐 chunk 推送 AI token。
    """
    if not body.content:
        return JSONResponse(status_code=400, content={"error": "Content is required"})

    return StreamingResponse(
        service.send_message_stream(id, body.content, body.agent),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
