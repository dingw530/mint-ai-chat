import json
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv


def _log(level: str, message: str, **data):
    """输出结构化 JSON 日志到 stdout，与 TS 端 logger.ts 格式一致。"""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "level": level,
        "module": "server",
        "message": message,
        "data": data,
    }
    print(json.dumps(entry, ensure_ascii=False), flush=True)


# 从 .env 文件加载环境变量（如 AI_CHAT_ENCRYPTION_KEY）
load_dotenv()

# 启动时校验加密密钥，缺失则直接退出，避免运行时加密/解密失败
if not os.environ.get("AI_CHAT_ENCRYPTION_KEY"):
    print("FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is not set", file=sys.stderr)
    print("HINT: Create a .env file with AI_CHAT_ENCRYPTION_KEY=your-key, or set it in the environment.", file=sys.stderr)
    sys.exit(1)

# ── 和风天气（QWeather）配置诊断 ──
qw_project_id = os.environ.get("QWEATHER_PROJECT_ID")
qw_key_id = os.environ.get("QWEATHER_KEY_ID")
qw_private_key = os.environ.get("QWEATHER_PRIVATE_KEY")
qw_configured = bool(qw_project_id and qw_key_id and qw_private_key)

_log("info", "和风天气配置诊断开始",
     projectIdStatus="已设置" if qw_project_id else "未设置",
     projectIdLength=len(qw_project_id) if qw_project_id else 0,
     keyIdStatus="已设置" if qw_key_id else "未设置",
     keyIdLength=len(qw_key_id) if qw_key_id else 0,
     privateKeyStatus="已设置" if qw_private_key else "未设置",
     privateKeyLength=len(qw_private_key) if qw_private_key else 0,
     privateKeyPrefix=(qw_private_key[:20] + "...") if qw_private_key else None,
     qwConfigured=qw_configured)

if not qw_configured:
    missing = []
    if not qw_project_id:
        missing.append("QWEATHER_PROJECT_ID")
    if not qw_key_id:
        missing.append("QWEATHER_KEY_ID")
    if not qw_private_key:
        missing.append("QWEATHER_PRIVATE_KEY")
    _log("warn", "和风天气功能已禁用",
         reason=f"缺少环境变量: {', '.join(missing)}")
else:
    _log("info", "和风天气功能已启用")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3001"))
    _log("info", "服务启动完成", port=port)
    uvicorn.run("app:app", host="0.0.0.0", port=port)
