from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

import httpx

from services.tool_registry import TOOL_DEFINITIONS, execute_tool


def _weather_configured() -> bool:
    """判断天气查询功能是否可用（三个 QWeather 环境变量必须全部设置）"""
    return bool(
        os.environ.get("QWEATHER_PROJECT_ID")
        and os.environ.get("QWEATHER_KEY_ID")
        and os.environ.get("QWEATHER_PRIVATE_KEY")
    )


def _build_body(
    messages: list[dict[str, Any]], settings: dict[str, Any], include_tools: bool
) -> dict[str, Any]:
    """构建发送给 AI API 的请求体

    - messages: 对话历史，含 system prompt、用户消息、assistant 回复
    - settings: AI 配置（模型、thinking mode 等）
    - include_tools: 是否附加工具定义（目前仅天气 agent 需要）
    """
    body_messages: list[dict[str, Any]] = []
    for m in messages:
        msg: dict[str, Any] = {"role": m["role"], "content": m.get("content")}
        # tool_calls 和 tool_call_id 只在多轮工具调用时需要回传
        if m.get("tool_calls"):
            msg["tool_calls"] = m["tool_calls"]
        if m.get("tool_call_id"):
            msg["tool_call_id"] = m["tool_call_id"]
        # thinking 模式下，assistant 消息附带 reasoning_content 字段
        if m["role"] == "assistant" and m.get("reasoning"):
            msg["reasoning_content"] = m["reasoning"]
        body_messages.append(msg)

    body: dict[str, Any] = {
        "model": settings["modelId"],
        "messages": body_messages,
        "stream": True,
    }

    # thinking 控制是否展示推理过程（如 DeepSeek R1 的 思维链）
    body["thinking"] = {"type": "enabled" if settings.get("thinkingMode") else "disabled"}

    if include_tools:
        body["tools"] = TOOL_DEFINITIONS
        body["tool_choice"] = "auto"

    return body


class _StreamChunk:
    """单次 SSE chunk 的解析结果，包含文本、推理过程和工具调用增量"""
    def __init__(self) -> None:
        self.content: str = ""
        self.reasoning: str = ""
        self.tool_call_deltas: list[dict[str, Any]] = []


async def _iter_raw_chunks(
    response: httpx.Response, thinking_mode: bool
) -> AsyncIterator[_StreamChunk]:
    """解析 AI API 返回的 NDJSON 流，逐行 yield StreamChunk

    使用 aiter_bytes() 逐块读取网络数据，手动 split 换行符，
    确保每个 data: {...} 行被独立解析，不因 TCP 包边界而延迟。
    """
    buffer = ""  # 跨 TCP 包的残片缓冲区
    async for raw in response.aiter_bytes():
        buffer += raw.decode("utf-8")
        lines = buffer.split("\n")
        buffer = lines.pop()  # 最后一个不完整行留到下次
        for line in lines:
            line = line.strip()
            if not line.startswith("data: "):
                continue
            data = line[6:]
            # SSE 结束标记
            if data == "[DONE]":
                return
            try:
                parsed = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = parsed.get("choices")
            if not choices:
                continue
            delta = choices[0].get("delta")
            if not delta:
                continue

            chunk = _StreamChunk()
            if delta.get("content"):
                chunk.content = delta["content"]
            # reasoning_content 是 AI 模型的推理过程（如 DeepSeek R1 的 思维链）
            if delta.get("reasoning_content") and thinking_mode:
                chunk.reasoning = delta["reasoning_content"]
            if delta.get("tool_calls"):
                for tc in delta["tool_calls"]:
                    chunk.tool_call_deltas.append(tc)
            yield chunk


async def _iter_sse_events(
    response: httpx.Response, thinking_mode: bool
) -> AsyncIterator[str]:
    """将原始 chunk 流转换为 SSE 格式的字符串流

    输出格式:
      data: {"content":"hello"}\n\n
      data: {"reasoning":"thinking..."}\n\n
      data: [DONE]\n\n
    """
    async for chunk in _iter_raw_chunks(response, thinking_mode):
        if chunk.content:
            yield f"data: {json.dumps({'content': chunk.content})}\n\n"
        if chunk.reasoning:
            yield f"data: {json.dumps({'reasoning': chunk.reasoning})}\n\n"

    yield "data: [DONE]\n\n"


async def _buffer_chunks(
    response: httpx.Response, thinking_mode: bool
) -> dict[str, Any]:
    """缓冲整个流式响应，不发送给客户端

    用于工具调用路径的第一阶段：需要先完整收集 AI 的响应，
    判断是否调用了工具，再决定是直接刷出还是执行工具后二次请求。
    """
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    tool_calls: list[dict[str, Any] | None] = []  # 按 index 排列的工具调用

    async for chunk in _iter_raw_chunks(response, thinking_mode):
        if chunk.content:
            content_parts.append(chunk.content)
        if chunk.reasoning:
            reasoning_parts.append(chunk.reasoning)
        for tc in chunk.tool_call_deltas:
            _merge_tool_call_delta(tool_calls, tc)

    has_tool_calls = any(tc is not None for tc in tool_calls)
    return {
        "content": "".join(content_parts),
        "reasoning": "".join(reasoning_parts),
        "toolCalls": [tc for tc in tool_calls if tc is not None] if has_tool_calls else None,
    }


def _merge_tool_call_delta(
    tool_calls: list[dict[str, Any] | None], delta: dict[str, Any]
) -> None:
    """合并流式工具调用增量

    AI API 的 tool_calls 是流式到达的，同一个工具调用的
    name 和 arguments 可能分散在多个 chunk 中，需要按 index 累积拼接。
    """
    idx = delta.get("index", 0)
    while len(tool_calls) <= idx:
        tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
    if tool_calls[idx] is None:
        tool_calls[idx] = {"id": "", "type": "function", "function": {"name": "", "arguments": ""}}
    tc = tool_calls[idx]
    if delta.get("id"):
        tc["id"] = delta["id"]
    if delta.get("type"):
        tc["type"] = delta["type"]
    fn = delta.get("function")
    if fn:
        # name 和 arguments 是逐步到达的片段，需要追加拼接
        if fn.get("name"):
            tc["function"]["name"] += fn["name"]
        if fn.get("arguments"):
            tc["function"]["arguments"] += fn["arguments"]


async def stream_chat(
    messages: list[dict[str, Any]],
    settings: dict[str, Any],
    agent: str | None = None,
) -> AsyncIterator[str]:
    """核心入口：向 AI API 发起流式请求，逐条 yield SSE 事件

    使用 client.send(stream=True) 而非 client.post()，
    后者会预读整个 response body 导致 SSE 一次性到达。
    stream=True 让底层连接保持打开，逐块读取 AI 返回的 token。

    两种路径:
    - Fast path（无工具）: 直接流式转发给客户端
    - Tool path（天气 agent）: 先缓冲首轮响应，检测到工具调用时执行再二次请求
    """
    api_url = settings.get("apiUrl", "")
    api_key = settings.get("apiKey", "")

    if not api_url or not api_key:
        yield f"data: {json.dumps({'error': 'API URL or API Key not configured'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    url = api_url.rstrip("/") + "/v1/chat/completions"
    # 仅当 agent=weather 且 QWeather 环境变量全部配置时才启用工具
    include_tools = agent == "weather" and _weather_configured()

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    # 在 async with 内创建 client，确保整个流式生命周期内连接不中断
    async with httpx.AsyncClient(timeout=300.0) as client:
        # ── Fast path: 无工具，直接流式 ──
        if not include_tools:
            body = _build_body(messages, settings, False)
            resp = await client.send(
                httpx.Request("POST", url, json=body, headers=headers),
                stream=True,
            )
            if not resp.is_success:
                error_text = (await resp.aread()).decode()
                yield f"data: {json.dumps({'error': f'AI API error ({resp.status_code}): {error_text}'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            async for sse in _iter_sse_events(resp, settings.get("thinkingMode", False)):
                yield sse
            return

        # ── Tool path: 先缓冲首轮响应，检测是否需要执行工具 ──
        body1 = _build_body(messages, settings, True)
        resp1 = await client.send(
            httpx.Request("POST", url, json=body1, headers=headers),
            stream=True,
        )
        if not resp1.is_success:
            error_text = (await resp1.aread()).decode()
            yield f"data: {json.dumps({'error': f'AI API error ({resp1.status_code}): {error_text}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        result = await _buffer_chunks(resp1, settings.get("thinkingMode", False))

        # 模型没有调用工具 → 直接刷出缓冲的内容
        if not result.get("toolCalls"):
            if result.get("content"):
                yield f"data: {json.dumps({'content': result['content']})}\n\n"
            if result.get("reasoning"):
                yield f"data: {json.dumps({'reasoning': result['reasoning']})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # ── 模型调用了工具 → 执行工具后二次请求 ──
        tool_messages: list[dict[str, Any]] = []
        for tc in result["toolCalls"]:
            try:
                tool_result = await execute_tool(tc)
            except Exception as err:
                tool_result = {"error": str(err)}
            # assistant 消息的 content 必须为 null（工具调用消息格式要求）
            tool_messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [tc],
                "reasoning": result.get("reasoning"),
            })
            tool_messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tool_result, ensure_ascii=False),
            })

        # 构建第二轮消息：原始历史 + 工具调用结果
        second_messages: list[dict[str, Any]] = []
        for m in messages:
            second_messages.append({
                "role": m["role"],
                "content": m["content"],
                "reasoning": m.get("reasoning"),
            })
        second_messages.extend(tool_messages)

        body2 = _build_body(second_messages, settings, False)
        resp2 = await client.send(
            httpx.Request("POST", url, json=body2, headers=headers),
            stream=True,
        )
        if not resp2.is_success:
            error_text = (await resp2.aread()).decode()
            yield f"data: {json.dumps({'error': f'AI API error ({resp2.status_code}): {error_text}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        async for sse in _iter_sse_events(resp2, settings.get("thinkingMode", False)):
            yield sse

        yield "data: [DONE]\n\n"
