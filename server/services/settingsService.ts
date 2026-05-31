import * as settingsRepo from '../repositories/settingsRepository.js';
import * as endpointRepo from '../repositories/endpointRepository.js';
import { encrypt, decrypt, maskApiKey } from './encryption.js';
import { RawSettings, SettingsInput, AiSettings, VisibleSettings } from '../types.js';

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
    activeEndpointId: activeEndpoint?.id || null,
    activeEndpointName: activeEndpoint?.name || null,
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
    };
  }
  // 兜底：旧 settings 表
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
  };
}

// 保存设置：API Key 加密后写入，仅在有新 key 时更新
// 同时同步 apiUrl/apiKey/modelId 到激活端点（若存在）
export function save({ apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode, reactMaxIterations, toolMaxRetries, showReactSteps }: SettingsInput): void {
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
  };
  if (apiKey) {
    settings.apiKey = encrypt(apiKey);
  }
  settingsRepo.upsertAll(settings);

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
