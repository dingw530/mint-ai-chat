import * as settingsRepo from '../../repositories/settingsRepository.js';
import * as endpointRepo from '../../repositories/endpointRepository.js';
import { encrypt, decrypt, maskApiKey } from '../utils/encryption.js';
import { RawSettings, SettingsInput, AiSettings, VisibleSettings } from '../../types.js';
import * as fs from 'fs';
import * as path from 'path';

const WIKI_SCHEMA = {
  version: 1,
  description: 'LLM Wiki 规范 — Schema 层',
  sourcesDir: 'sources',
  pagesDir: 'pages',
  tags: [],
  categories: [],
  pageTemplate: {
    required_frontmatter: ['title', 'created', 'source'],
  },
};

const WIKI_INDEX_CONTENT = `# Wiki 首页

这是一个 LLM Wiki 知识库，遵循三层架构（Schema → Wiki → Sources）。

## 目录结构

- \`_schema.json\` — Schema 层：规范、标签、分类、页面结构约定
- \`_index.md\` — 本文件，Wiki 首页
- \`sources/\` — Sources 层：原始资料，不可变
- \`pages/\` — Wiki 知识层：LLM 编译的结构化 Markdown 页面

## 最近更新

`;

function ensureWikiPath(wikiPath: string): void {
  if (!wikiPath) return;
  try {
    const resolved = path.resolve(wikiPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    // Schema 层：_schema.json
    const schemaPath = path.join(resolved, '_schema.json');
    if (!fs.existsSync(schemaPath)) {
      fs.writeFileSync(schemaPath, JSON.stringify(WIKI_SCHEMA, null, 2), 'utf-8');
    }
    // 首页
    const indexPath = path.join(resolved, '_index.md');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, WIKI_INDEX_CONTENT, 'utf-8');
    }
    // Sources 层
    const sourcesDir = path.join(resolved, 'sources');
    if (!fs.existsSync(sourcesDir)) {
      fs.mkdirSync(sourcesDir, { recursive: true });
      fs.writeFileSync(path.join(sourcesDir, '.gitkeep'), '');
    }
    // Wiki 知识层
    const pagesDir = path.join(resolved, 'pages');
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
      fs.writeFileSync(path.join(pagesDir, '.gitkeep'), '');
    }
  } catch (err) {
    console.error('[settingsService] Failed to initialize wiki path:', err);
  }
}

// 获取脱敏后的设置（API Key 解密后重新掩码）
export function get(): VisibleSettings {
  const raw: RawSettings = settingsRepo.getAll();
  let apiKeyMasked = '';
  if (raw.apiKey) {
    try {
      apiKeyMasked = maskApiKey(decrypt(raw.apiKey));
    } catch {
      apiKeyMasked = '****';  // 解密失败（如密钥变更），显示掩码
    }
  }
  const activeEndpoint = endpointRepo.getActive();
  return {
    apiUrl: raw.apiUrl || '',
    apiKeyMasked,
    modelId: raw.modelId || '',
    systemPrompt: raw.systemPrompt || '',
    thinkingMode: raw.thinkingMode === 'true',
    memoryEnabled: raw.memoryEnabled === 'true',
    routingMode: raw.routingMode || 'auto',
    reactMaxIterations: parseInt(raw.reactMaxIterations || '5', 10),
    toolMaxRetries: parseInt(raw.toolMaxRetries || '5', 10),
    showReactSteps: raw.showReactSteps !== 'false',
    maxContextRounds: parseInt(raw.maxContextRounds || '10', 10),
    activeEndpointId: activeEndpoint?.id || null,
    activeEndpointName: activeEndpoint?.name || null,
    wikiPath: raw.wikiPath || '',
    wikiMaxFileSize: parseInt(raw.wikiMaxFileSize || '10485760', 10),
  };
}

// 获取内部使用的 AI 设置（优先从激活端点读取，兜底旧 settings）
export function getAiSettings(): AiSettings {
  const activeEndpoint = endpointRepo.getActive();
  if (activeEndpoint) {
    let apiKey = '';
    if (activeEndpoint.apiKey) {
      try {
        apiKey = decrypt(activeEndpoint.apiKey);
      } catch {
        apiKey = '';
      }
    }
    const raw: RawSettings = settingsRepo.getAll();
    return {
      apiUrl: activeEndpoint.apiUrl,
      apiKey,
      modelId: activeEndpoint.modelId,
      apiType: activeEndpoint.apiType || 'openai-chat',
      systemPrompt: raw.systemPrompt || '',
      thinkingMode: raw.thinkingMode === 'true',
      memoryEnabled: raw.memoryEnabled === 'true',
      reactMaxIterations: parseInt(raw.reactMaxIterations || '5', 10),
      toolMaxRetries: parseInt(raw.toolMaxRetries || '5', 10),
      showReactSteps: raw.showReactSteps !== 'false',
      maxContextRounds: parseInt(raw.maxContextRounds || '10', 10),
      wikiPath: raw.wikiPath || '',
      wikiMaxFileSize: parseInt(raw.wikiMaxFileSize || '10485760', 10),
    };
  }
  // 兜底：旧 settings 表（过渡期兼容）
  // @deprecated — 新安装用户应通过 model_endpoints 配置
  const raw: RawSettings = settingsRepo.getAll();
  return {
    apiUrl: raw.apiUrl || '',
    apiKey: raw.apiKey ? decrypt(raw.apiKey) : '',
    modelId: raw.modelId || 'gpt-4o-mini',
    apiType: 'openai-chat',
    systemPrompt: raw.systemPrompt || '',
    thinkingMode: raw.thinkingMode === 'true',
    memoryEnabled: raw.memoryEnabled === 'true',
    reactMaxIterations: parseInt(raw.reactMaxIterations || '5', 10),
    toolMaxRetries: parseInt(raw.toolMaxRetries || '5', 10),
    showReactSteps: raw.showReactSteps !== 'false',
    maxContextRounds: parseInt(raw.maxContextRounds || '10', 10),
    wikiPath: raw.wikiPath || '',
    wikiMaxFileSize: parseInt(raw.wikiMaxFileSize || '10485760', 10),
  };
}

// 保存设置：API Key 加密后写入，仅在有新 key 时更新
// @deprecated — 同步端点逻辑将在后续版本移除，前端直接操作 model_endpoints 接口
export function save({ apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode, reactMaxIterations, toolMaxRetries, showReactSteps, wikiPath, wikiMaxFileSize }: SettingsInput): void {
  const settings: Record<string, string> = {
    apiUrl,
    modelId,
    systemPrompt: systemPrompt || '',
    thinkingMode: thinkingMode ? 'true' : 'false',
    memoryEnabled: memoryEnabled ? 'true' : 'false',
    routingMode: routingMode || 'auto',
    reactMaxIterations: String(reactMaxIterations ?? 5),
    toolMaxRetries: String(toolMaxRetries ?? 5),
    showReactSteps: showReactSteps !== undefined ? String(showReactSteps) : 'true',
    wikiPath: wikiPath || '',
    wikiMaxFileSize: String(wikiMaxFileSize ?? 10485760),
  };
  if (apiKey) {
    settings.apiKey = encrypt(apiKey);
  }
  settingsRepo.upsertAll(settings);

  // 自动初始化 Wiki 目录
  if (wikiPath) {
    ensureWikiPath(wikiPath);
  }

  // 同步到激活端点
  const activeEndpoint = endpointRepo.getActive();
  if (activeEndpoint) {
    const fields: Record<string, unknown> = {};
    if (apiUrl) fields.apiUrl = apiUrl;
    if (apiKey) fields.apiKey = encrypt(apiKey);
    if (modelId) fields.modelId = modelId;
    if (Object.keys(fields).length > 0) {
      endpointRepo.update(activeEndpoint.id, fields);
    }
  }
}
