from __future__ import annotations

import json
import uuid
from typing import Any, AsyncIterator

import repositories.conversation_repository as conv_repo
import repositories.message_repository as msg_repo
import services.settings_service as settings_service
from database import now
from services.ai_proxy import stream_chat


def _http_error(message: str, status: int) -> Exception:
    e = Exception(message)
    e.status_code = status
    return e


def get_messages(conversation_id: str) -> list[dict[str, Any]]:
    """获取对话的所有消息，先校验对话是否存在"""
    conv = conv_repo.find_by_id(conversation_id)
    if not conv:
        raise _http_error("Conversation not found", 404)
    return msg_repo.find_by_conversation_id(conversation_id)


async def send_message_stream(
    conversation_id: str, content: str, agent: str | None = None
) -> AsyncIterator[str]:
    """核心流程：保存用户消息 → 流式获取 AI 回复 → 保存 assistant 回复

    由 routes/messages.py 的 StreamingResponse 驱动，逐条 yield SSE event。
    异常时确保关闭流（yield [DONE]），避免前端挂起。
    """
    conv = conv_repo.find_by_id(conversation_id)
    if not conv:
        yield f"data: {json.dumps({'error': 'Conversation not found'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    ts = now()
    user_msg_id = str(uuid.uuid4())

    msg_repo.create({
        "id": user_msg_id,
        "conversationId": conversation_id,
        "role": "user",
        "content": content,
        "createdAt": ts,
    })
    msg_repo.update_conversation_timestamp(conversation_id, ts)

    history = msg_repo.get_history(conversation_id)
    settings = settings_service.get_ai_settings()

    messages: list[dict[str, Any]] = (
        [{"role": "system", "content": settings["systemPrompt"]}, *history]
        if settings["systemPrompt"]
        else history
    )

    full_content = ""
    full_reasoning = ""
    last_was_done = False
    try:
        async for event in stream_chat(messages, settings, agent):
            yield event
            # Accumulate content/reasoning for DB persistence
            if event.startswith("data: ") and not event.startswith("data: [DONE]"):
                try:
                    payload = json.loads(event[6:].strip())
                    if "content" in payload:
                        full_content += payload["content"]
                    if "reasoning" in payload:
                        full_reasoning += payload["reasoning"]
                except json.JSONDecodeError:
                    pass
            if event == "data: [DONE]\n\n":
                last_was_done = True
    except Exception as e:
        import traceback
        traceback.print_exc()
        if not last_was_done:
            yield f"data: {json.dumps({'error': 'AI streaming failed'})}\n\n"
            yield "data: [DONE]\n\n"
        return

    # Save assistant response
    if full_content:
        msg_repo.create({
            "id": str(uuid.uuid4()),
            "conversationId": conversation_id,
            "role": "assistant",
            "content": full_content,
            "reasoning": full_reasoning or None,
            "createdAt": now(),
        })
