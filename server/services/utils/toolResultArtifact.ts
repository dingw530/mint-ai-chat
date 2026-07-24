import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** 超过此大小的工具结果会转为 artifact 摘要。 */
export const TOOL_RESULT_ARTIFACT_THRESHOLD = 12_000;
const TOOL_RESULT_PREVIEW_LIMIT = 2_000;

export interface ToolResultMessageOptions {
  summary?: string;
  conversationId?: string;
}

/**
 * 解包工具可能返回的双重 JSON 字符串，避免 artifact 保存时重复转义。
 * @param result 工具原始结果
 * @returns 适合持久化的结果值
 */
function normalizeArtifactResult(result: unknown): unknown {
  if (typeof result !== 'string') return result;

  try {
    const parsed = JSON.parse(result) as unknown;
    return parsed === result ? result : parsed;
  } catch {
    return result;
  }
}

/**
 * 获取 Mint 持久化数据根目录下的 artifact 目录。
 * @returns artifact 根目录
 */
export function getArtifactRoot(): string {
  if (process.env.AI_CHAT_CONTEXT_ARTIFACT_DIR) {
    return process.env.AI_CHAT_CONTEXT_ARTIFACT_DIR;
  }
  if (process.env.AI_CHAT_DB_PATH) {
    return join(dirname(process.env.AI_CHAT_DB_PATH), 'context-artifacts');
  }
  return join(homedir(), '.mint', 'context-artifacts');
}

/**
 * 将工具结果转换为发送给模型的消息内容。
 * 小结果保持原始 JSON；大结果写入临时 artifact，仅返回摘要、预览和 hash。
 * @param result 工具原始结果
 * @param options 摘要、会话和 artifact 配置
 * @returns 可直接作为 tool message content 的 JSON 字符串
 */
export async function serializeToolResultForContext(
  result: unknown,
  options: ToolResultMessageOptions = {},
): Promise<string> {
  const normalizedResult = normalizeArtifactResult(result);
  const serialized = JSON.stringify(normalizedResult) ?? String(normalizedResult);
  const byteLength = Buffer.byteLength(serialized, 'utf8');

  if (byteLength <= TOOL_RESULT_ARTIFACT_THRESHOLD) {
    return serialized;
  }

  const conversationKey = (options.conversationId || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  const artifactDirectory = join(getArtifactRoot(), conversationKey);
  const artifactPath = join(artifactDirectory, `${Date.now()}-${randomUUID()}.json`);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, serialized, 'utf8');

  const sha256 = createHash('sha256').update(serialized).digest('hex');
  return JSON.stringify({
    status: 'success',
    summary: options.summary || '工具结果过大，完整结果已保存为 artifact。',
    preview: serialized.slice(0, TOOL_RESULT_PREVIEW_LIMIT),
    artifact: {
      path: artifactPath,
      bytes: byteLength,
      sha256,
    },
  });
}
