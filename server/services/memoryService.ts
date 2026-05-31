import { v4 as uuidv4 } from 'uuid';
import * as memoryRepo from '../repositories/memoryRepository.js';
import { Memory, CreateMemoryParams, UpdateMemoryParams, AiSettings } from '../types.js';

const CATEGORY_ORDER = ['personal', 'preference', 'feedback', 'project', 'goal', 'general'];
const CATEGORY_LABELS: Record<string, string> = {
  personal: '个人信息',
  preference: '偏好',
  feedback: '行为反馈',
  project: '项目信息',
  goal: '目标意图',
  general: '通用',
};

// ── CRUD 包装函数 ──

export function listMemories(category?: string): Memory[] {
  if (category) {
    return memoryRepo.findByCategory(category);
  }
  return memoryRepo.findAll();
}

export function createMemory(data: CreateMemoryParams): Memory {
  return memoryRepo.create(data);
}

export function updateMemory(id: string, data: UpdateMemoryParams): Memory | null {
  return memoryRepo.update(id, data);
}

export function deleteMemory(id: string): void {
  memoryRepo.deleteById(id);
}

// ── 构建记忆上下文 ──

export function buildMemoryContext(): string {
  const memories = memoryRepo.findAll();
  if (memories.length === 0) return '';

  // 按分类分组
  const groups: Record<string, Memory[]> = {};
  for (const m of memories) {
    const cat = m.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }

  const lines: string[] = ['以下是关于用户的历史信息（分类整理）：'];
  for (const category of CATEGORY_ORDER) {
    const items = groups[category];
    if (!items || items.length === 0) continue;
    const label = CATEGORY_LABELS[category] || category;
    lines.push(`\n${label}：`);
    for (const item of items) {
      lines.push(`- ${item.content}`);
    }
  }
  lines.push('\n这些信息来自之前的对话，在回答时请参考。');

  return lines.join('\n');
}

// ── 价值判断（v1.5.1） ──

// 纯感叹/寒暄列表——过滤无信息含量的常见短语
const GREETING_SET = new Set([
  '哈哈', '好的', '谢谢', '明白了', '知道了', '收到', '嗯嗯', '好的呢',
  'ok', 'okay', '好的谢谢', '好的谢谢啦', '明白了谢谢', '好的明白了',
  '对', '是', '好', '嗯', '行', '可以', '没问题', '不错', '厉害',
  '你好', 'hello', 'hi', '嗨',
]);

// 自指模式正则——检测用户是否在分享个人信息
const SELF_REF_PATTERNS = [
  /我(?:叫|是|的|来自|从事|做|在|就[职任]|有|喜欢|爱|希望|想|要|觉得|认为|习惯|通常|用|正在|之前|过去|目前|现在|以后|未来)/,
  /(?:喜欢|不喜欢|偏爱|倾向于|习惯|愿意|希望|想要|更(?:愿意|喜欢|倾向于))(?![^。]*[？?])/,
  /(?:不对|不是|错了|更正|纠正|应该说|其实是|我[的想]意思是|你说[得错]|你理解错)/,
  /(?:在做|在搞|开发|项目中|项目是|技术栈|用的|使用|采用|负责|从事|参与)/,
  /(?:打算|计划|目标|想要|希望|准备|正在[学研调开]|学习|研究|调研)/,
  /(?:在[哪这]|来自|毕业于|工作在|就职于|负责|从事|主[要做]).{2,}/,
  /我(?:的名字叫|的称呼是|可以叫我|全名(?:是|为)).{1,}/,
  /(?:年[龄纪]|岁[数了]).{0,5}\d+/,
];

/**
 * 判断用户消息是否包含值得记忆的信息。
 * 在调用 LLM 提取 API 前执行，避免无效 API 调用。
 * 纯同步操作，<5ms。
 */
export function isConversationValuable(userContent: string): boolean {
  if (!userContent || typeof userContent !== 'string') return false;
  const text = userContent.trim();
  if (text.length < 10) return false;        // 太短，不太可能有有效信息
  if (GREETING_SET.has(text.toLowerCase())) return false; // 纯寒暄

  for (const pattern of SELF_REF_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ── 执行 AI 提取 ──

export async function performExtraction(
  settings: AiSettings,
  userContent: string,
  assistantContent: string,
  conversationId: string
): Promise<void> {
  if (!settings.memoryEnabled) return;

  const { apiUrl, apiKey } = settings;
  if (!apiUrl || !apiKey) return;

  const url = apiUrl.replace(/\/+$/, '') + '/v1/chat/completions';

  const systemPrompt = `你是一个记忆提取助手。从以下对话中提取关于用户的重要信息，按分类输出。

分类标签：
[personal]    个人信息（名字、职业、地点、背景等）
[preference]  用户偏好（喜欢的风格、语言、主题、回答方式等）
[feedback]    行为反馈（用户的纠正、不满意、补充要求等）
[project]     项目信息（正在做的事、技术栈、业务领域等）
[goal]        目标意图（用户想达成的目标、学习计划等）
[general]     通用（其他值得记住的信息）

输出格式（每行一条）：
[分类] 事实内容

规则：
- 只提取确定的、跨对话有价值的信息
- 如果没有新信息，输出空
- 每行格式必须严格为 [分类] 内容`;

  const body = {
    model: settings.modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
      { role: 'assistant', content: assistantContent },
    ],
    stream: false,
    max_tokens: 500,
    temperature: 0.3,
    thinking: { type: 'disabled' },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[memory] Extraction API error:', response.status, errText);
      return;
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) return;

    const entries = extractMemoriesFromResponse(content);
    for (const entry of entries) {
      // 精确去重
      const existing = memoryRepo.findByContent(entry.content);
      if (existing) continue;
      // 入库
      memoryRepo.create({
        id: uuidv4(),
        content: entry.content,
        category: entry.category,
        sourceConversationId: conversationId,
      });
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error('[memory] Extraction timed out after 10s');
    } else {
      console.error('[memory] Extraction failed:', err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ── 解析 LLM 响应 ──

export function extractMemoriesFromResponse(text: string): { category: string; content: string }[] {
  const lines = text.split('\n');
  const results: { category: string; content: string }[] = [];
  const regex = /^\[(\w+)\]\s+(.+)$/;
  const validCategories = new Set(CATEGORY_ORDER);

  for (const line of lines) {
    const match = line.trim().match(regex);
    if (!match) continue;
    const category = match[1];
    const content = match[2].trim();
    if (validCategories.has(category) && content) {
      results.push({ category, content });
    }
  }

  return results;
}
