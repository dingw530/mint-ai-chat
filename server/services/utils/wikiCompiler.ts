import * as fs from 'fs';
import * as path from 'path';
import { getAdapter } from '../adapters/apiAdapter.js';
import { isPathSafe } from './pathSecurity.js';
import { CompiledPage, INGEST_SYSTEM_PROMPT as SHARED_PROMPT, tryParseLooseJson, writeWikiPages, updateIndexMd, discoverCategoriesFromDir } from './wikiShared.js';
import type { AiSettings } from '../../types.js';

export interface CompileResult {
  pages: { filename: string; title: string; size: number }[];
  summary: string;
}

/**
 * 调用 AI API 将原始资料编译为 Wiki 页面
 */
async function callAiForCompilation(
  settings: AiSettings,
  sourceText: string,
  sourceFilename: string,
  schema: Record<string, unknown>,
  title?: string,
  category?: string,
): Promise<string> {
  const schemaInfo = JSON.stringify(schema, null, 2);
  const categories = (schema.categories as string[]) || [];
  const prompt = SHARED_PROMPT.replace('{sourceFilename}', sourceFilename);
  const userMessage = `标题：${title || '（AI 自动生成）'}
分类：${category || '（AI 自动归类）'}
原始文件名：${sourceFilename}

当前可用分类：${JSON.stringify(categories)}
当前 Schema 规范：
\`\`\`json
${schemaInfo}
\`\`\`

原始资料：
${sourceText}`;

  console.log(`[wikiCompiler] calling AI: url=${settings.apiUrl}, model=${settings.modelId}, apiKey=${settings.apiKey ? 'set(' + settings.apiKey.substring(0, 8) + '...)' : 'NOT SET'}`);

  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) throw new Error('Adapter not found');

  const result = await adapter.call(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ],
    { modelId: settings.modelId },
    settings.apiUrl,
    settings.apiKey,
    { maxTokens: 4096, temperature: 0.3 },
  );

  console.log(`[wikiCompiler] AI response received, length=${result.length}, preview=${result.substring(0, 100)}`);

  return result;
}

/**
 * 将 AI 编译结果写入 pages/ 目录
 */

/**
 * 更新 _index.md
 */

/**
 * 宽松解析 AI 返回的 JSON：先尝试标准 parse，失败则将字符串值中的字面换行符转义后重试。
 */
/** AI 输出的 content 字段常含字面换行符和未转义双引号，
 *  标准 JSON.parse 必然失败。此函数通过逐字段提取绕过此问题：
 *  1. 先尝试标准 parse / 提取 {...}
 *  2. 若仍失败，用正则逐个提取 page 对象中的 filename/title/tags/content
 *  3. 对 content 字段，通过引号平衡算法安全截取原始内容并手动转义 */


/**
 * 编译源文本并写入 Wiki 页面
 * 返回编译结果（页面列表 + 摘要）
 */
export async function compileSource(
  settings: AiSettings,
  wikiPath: string,
  sourceText: string,
  sourceFilename: string,
  options?: { title?: string; category?: string },
): Promise<CompileResult> {
  const schemaPath = path.join(wikiPath, '_schema.json');
  let schema: Record<string, unknown> = {};
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch {
    // schema 不存在或无法解析时使用空对象
  }

  discoverCategoriesFromDir(wikiPath, schema);

  const aiResult = await callAiForCompilation(
    settings,
    sourceText,
    sourceFilename,
    schema,
    options?.title,
    options?.category,
  );

  let compiled: { pages: CompiledPage[]; summary: string };
  // AI 常在 content 字段中输出字面换行符，导致 JSON.parse 失败，先尝试宽松解析
  let parsed: any = tryParseLooseJson(aiResult);
  if (!parsed) {
    const preview = aiResult.length > 500 ? aiResult.substring(0, 500) + '...' : aiResult;
    console.error(`[wikiCompiler] AI 返回非 JSON 格式 (len=${aiResult.length})，完整返回:`);
    console.error(aiResult);
    throw new Error(`AI 返回格式异常，完整返回已打印到日志`);
  }
  compiled = parsed;

  if (!compiled.pages || compiled.pages.length === 0) {
    throw new Error('AI 未生成任何 Wiki 页面');
  }

  const results = writeWikiPages(wikiPath, compiled.pages);
  updateIndexMd(wikiPath, compiled.pages);

  return {
    pages: results,
    summary: compiled.summary || `成功创建 ${results.length} 个 Wiki 页面`,
  };
}
