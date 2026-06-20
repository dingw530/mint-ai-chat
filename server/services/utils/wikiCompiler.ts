import * as fs from 'fs';
import * as path from 'path';
import { isPathSafe } from './pathSecurity.js';
import type { AiSettings } from '../../types.js';

export interface CompiledPage {
  filename: string;
  title: string;
  tags: string[];
  content: string;
}

export interface CompileResult {
  pages: { filename: string; title: string; size: number }[];
  summary: string;
}

const INGEST_SYSTEM_PROMPT = `你是一个知识编译助手，遵循 LLM Wiki 三层架构（Schema → Wiki → Sources）。

你的任务是将用户提供的原始资料编译为结构化的 Wiki 知识页面。

## 三层架构说明
- **Sources 层（sources/）**：原始资料已由工具保存，不可变
- **Wiki 知识层（pages/）**：你需要生成结构化的 Markdown 页面，放入 pages/ 目录
- **Schema 层（_schema.json）**：遵循此标签和分类规范

## 要求
1. 分析资料内容，提取关键知识点
2. 根据资料长度和主题复杂度，决定建一个或多个页面
3. 每个页面必须包含 YAML frontmatter：
   - title: 页面标题
   - tags: [标签列表]
   - created: YYYY-MM-DD
   - source: {sourceFilename}
4. 内容用 Markdown 编写，结构清晰
5. 页面之间使用相对路径交叉链接
6. 文件名使用英文小写 kebab-case，放在 pages/ 下

## 输出格式
纯 JSON（不要包含其他文字）：
{
  "pages": [
    {
      "filename": "pages/分类/页面名.md",
      "title": "页面标题",
      "tags": ["标签1"],
      "content": "---\\ntitle: 页面标题\\ntags: [标签1]\\ncreated: YYYY-MM-DD\\nsource: 原始文件名\\n---\\n\\n正文..."
    }
  ],
  "summary": "一句话总结本次摄入"
}`;

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
  const prompt = INGEST_SYSTEM_PROMPT.replace('{sourceFilename}', sourceFilename);
  const userMessage = `标题：${title || '（AI 自动生成）'}
分类：${category || '（AI 自动归类）'}
原始文件名：${sourceFilename}

当前 Schema 规范：
\`\`\`json
${schemaInfo}
\`\`\`

原始资料：
${sourceText}`;

  const url = settings.apiUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  console.log(`[wikiCompiler] calling AI: url=${url}, model=${settings.modelId}, apiKey=${settings.apiKey ? 'set(' + settings.apiKey.substring(0, 8) + '...)' : 'NOT SET'}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelId,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  console.log(`[wikiCompiler] AI response status=${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    console.log(`[wikiCompiler] AI error body (first 500): ${errText.substring(0, 500)}`);
    throw new Error(`AI API 请求失败 (${response.status}): ${errText.substring(0, 200)}`);
  }

  const respText = await response.text();
  console.log(`[wikiCompiler] AI response body length=${respText.length}, preview=${respText.substring(0, 100)}`);

  let data: { choices: { message: { content: string } }[] };
  try {
    data = JSON.parse(respText);
  } catch {
    throw new Error(`AI API 返回非 JSON 格式, 前 200 字符: ${respText.substring(0, 200)}`);
  }
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 将 AI 编译结果写入 pages/ 目录
 */
function writeWikiPages(wikiPath: string, pages: CompiledPage[]): { filename: string; title: string; size: number }[] {
  const results: { filename: string; title: string; size: number }[] = [];

  for (const page of pages) {
    const pagePath = page.filename.startsWith('pages/') ? page.filename : `pages/${page.filename}`;
    if (!isPathSafe(wikiPath, pagePath)) {
      throw new Error(`路径穿越被拒绝: ${pagePath}`);
    }

    const resolvedPath = path.resolve(wikiPath, pagePath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, page.content, 'utf-8');
    const stat = fs.statSync(resolvedPath);

    results.push({
      filename: pagePath,
      title: page.title,
      size: stat.size,
    });
  }

  return results;
}

/**
 * 更新 _index.md
 */
function updateIndexMd(wikiPath: string, pages: { filename: string; title: string }[]): void {
  const indexPath = path.join(wikiPath, '_index.md');
  let content = '';
  if (fs.existsSync(indexPath)) {
    content = fs.readFileSync(indexPath, 'utf-8');
  } else {
    content = `# Wiki 首页\n\n这是 LLM Wiki 知识库的首页。\n\n## 最近更新\n`;
  }

  const lines: string[] = [];
  for (const page of pages) {
    const linkPath = page.filename.replace(/\.md$/, '');
    lines.push(`- [${page.title}](${linkPath})`);
  }

  fs.writeFileSync(indexPath, content + lines.join('\n') + '\n', 'utf-8');
}

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

  const aiResult = await callAiForCompilation(
    settings,
    sourceText,
    sourceFilename,
    schema,
    options?.title,
    options?.category,
  );

  let compiled: { pages: CompiledPage[]; summary: string };
  try {
    compiled = JSON.parse(aiResult);
  } catch {
    throw new Error('AI 返回格式异常，无法解析为 Wiki 页面结构');
  }

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
