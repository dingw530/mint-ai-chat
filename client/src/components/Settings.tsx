import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings } from '../services/api';
import McpServersPanel from './McpServersPanel';
import AgentsPanel from './AgentsPanel';
import MemoriesPanel from './MemoriesPanel';
import EndpointsPanel from './EndpointsPanel';
import type { VisibleSettings } from '../types';

function Toast({ toast }: { toast: { type: string; message: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  );
}

type StringSetter = (value: string) => void;
type BooleanSetter = (value: boolean) => void;
type NumberSetter = (value: number) => void;

interface GeneralTabProps {
  apiUrl: string; setApiUrl: StringSetter;
  apiKey: string; setApiKey: StringSetter;
  modelId: string; setModelId: StringSetter;
  systemPrompt: string; setSystemPrompt: StringSetter;
  thinkingMode: boolean; setThinkingMode: BooleanSetter;
  memoryEnabled: boolean; setMemoryEnabled: BooleanSetter;
  routingMode: string; setRoutingMode: StringSetter;
  errors: Record<string, string>; setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  apiKeyDirty: boolean; setApiKeyDirty: BooleanSetter;
  theme: string; setTheme: StringSetter;
  reactMaxIterations: number; setReactMaxIterations: NumberSetter;
  toolMaxRetries: number; setToolMaxRetries: NumberSetter;
  showReactSteps: boolean; setShowReactSteps: BooleanSetter;
}

function GeneralTab({
  apiUrl, setApiUrl, apiKey, setApiKey, modelId, setModelId,
  systemPrompt, setSystemPrompt, thinkingMode, setThinkingMode,
  memoryEnabled, setMemoryEnabled, routingMode, setRoutingMode,
  errors, setErrors, apiKeyDirty, setApiKeyDirty,
  theme, setTheme, reactMaxIterations, setReactMaxIterations,
  toolMaxRetries, setToolMaxRetries, showReactSteps, setShowReactSteps,
}: GeneralTabProps) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="apiUrl">API URL</label>
        <input
          id="apiUrl"
          type="text"
          value={apiUrl}
          onChange={(e) => {
            setApiUrl(e.target.value);
            if (errors.apiUrl) setErrors((prev) => ({ ...prev, apiUrl: '' }));
          }}
          placeholder="https://api.openai.com/v1"
          className={errors.apiUrl ? 'input-error' : ''}
        />
        {errors.apiUrl && <div className="field-error">{errors.apiUrl}</div>}
      </div>
      <div className="form-group">
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setApiKeyDirty(true);
            if (errors.apiKey) setErrors((prev) => ({ ...prev, apiKey: '' }));
          }}
          placeholder="sk-..."
          className={errors.apiKey ? 'input-error' : ''}
        />
        {errors.apiKey && <div className="field-error">{errors.apiKey}</div>}
      </div>
      <div className="form-group">
        <label htmlFor="modelId">模型 ID</label>
        <input
          id="modelId"
          type="text"
          value={modelId}
          onChange={(e) => {
            setModelId(e.target.value);
            if (errors.modelId) setErrors((prev) => ({ ...prev, modelId: '' }));
          }}
          placeholder="gpt-4o-mini"
          className={errors.modelId ? 'input-error' : ''}
        />
        {errors.modelId && <div className="field-error">{errors.modelId}</div>}
      </div>
      <div className="form-group">
        <label htmlFor="systemPrompt">系统提示词</label>
        <textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="你是一个有帮助的助手..."
          rows={4}
          style={{ resize: 'vertical' }}
        />
      </div>
      <div className="form-group">
        <label>模式</label>
        <div className="mode-toggle">
          <button className={!thinkingMode ? 'active' : ''} onClick={() => setThinkingMode(false)}>快速</button>
          <button className={thinkingMode ? 'active' : ''} onClick={() => setThinkingMode(true)}>深度思考</button>
        </div>
      </div>
      <div className="form-group">
        <label>记忆功能</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={!memoryEnabled ? 'active' : ''}
            onClick={() => setMemoryEnabled(false)}
          >关闭</button>
          <button
            type="button"
            className={memoryEnabled ? 'active' : ''}
            onClick={() => setMemoryEnabled(true)}
          >开启</button>
        </div>
        <p className="form-help">开启后，AI 会从对话中提取关键信息并在后续对话中参考。</p>
      </div>
      <div className="form-group">
        <label>路由模式</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={routingMode === 'auto' ? 'active' : ''}
            onClick={() => setRoutingMode('auto')}
          >自动</button>
          <button
            type="button"
            className={routingMode === 'manual' ? 'active' : ''}
            onClick={() => setRoutingMode('manual')}
          >手动</button>
        </div>
        <p className="form-help">自动模式下，AI 会根据消息内容自动选择合适的 Agent。</p>
      </div>
      <div className="form-group">
        <label>主题皮肤</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={theme === 'mint' ? 'active' : ''}
            onClick={() => setTheme('mint')}
          >Mint 沁绿</button>
          <button
            type="button"
            className={theme === 'ocean' ? 'active' : ''}
            onClick={() => setTheme('ocean')}
          >海洋冰蓝</button>
          <button
            type="button"
            className={theme === 'snow' ? 'active' : ''}
            onClick={() => setTheme('snow')}
          >蓝雪花 ❄</button>
          <button
            type="button"
            className={theme === 'anthropic' ? 'active' : ''}
            onClick={() => setTheme('anthropic')}
          >Anthropic</button>
          <button
            type="button"
            className={theme === 'reddot' ? 'active' : ''}
            onClick={() => setTheme('reddot')}
          >炽红</button>
        </div>
        <p className="form-help">切换应用的色彩主题风格，即时生效。</p>
      </div>
      <hr className="settings-divider" />
      <h4 className="settings-subheading">ReAct 推理设置</h4>
      <div className="form-group">
        <label htmlFor="reactMaxIterations">最大迭代次数</label>
        <input
          id="reactMaxIterations"
          type="number"
          min="0"
          max="20"
          value={reactMaxIterations}
          onChange={(e) => setReactMaxIterations(Math.max(0, Math.min(20, parseInt(e.target.value) || 5)))}
        />
        <p className="form-help">AI 在单次回复中最多可连续调用工具的轮数（0~20）。设为 0 则使用传统模式。</p>
      </div>
      <div className="form-group">
        <label htmlFor="toolMaxRetries">工具重试次数</label>
        <input
          id="toolMaxRetries"
          type="number"
          min="0"
          max="10"
          value={toolMaxRetries}
          onChange={(e) => setToolMaxRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 5)))}
        />
        <p className="form-help">工具调用失败时的最大重试次数（0~10）。设为 0 则不重试。</p>
      </div>
      <div className="form-group">
        <label>显示推理过程</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={showReactSteps ? 'active' : ''}
            onClick={() => setShowReactSteps(true)}
          >显示</button>
          <button
            type="button"
            className={!showReactSteps ? 'active' : ''}
            onClick={() => setShowReactSteps(false)}
          >隐藏</button>
        </div>
        <p className="form-help">控制 ReAct 推理过程中工具调用的步骤信息是否在对话中展示。</p>
      </div>
    </>
  );
}

interface SettingsProps {
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

export default function Settings({ onClose, theme, onThemeChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [thinkingMode, setThinkingMode] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [routingMode, setRoutingMode] = useState('auto');
  const [localTheme, setLocalTheme] = useState(theme || 'mint');
  const [reactMaxIterations, setReactMaxIterations] = useState(5);
  const [toolMaxRetries, setToolMaxRetries] = useState(5);
  const [showReactSteps, setShowReactSteps] = useState(true);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    getSettings()
      .then((data: VisibleSettings) => {
        setApiUrl(data.apiUrl || '');
        if (data.apiKeyMasked) {
          setApiKey(data.apiKeyMasked);
        }
        setModelId(data.modelId || '');
        setSystemPrompt(data.systemPrompt || '');
        setThinkingMode(data.thinkingMode || false);
        setMemoryEnabled(data.memoryEnabled || false);
        setRoutingMode(data.routingMode || 'auto');
        setReactMaxIterations(data.reactMaxIterations ?? 5);
        setToolMaxRetries(data.toolMaxRetries ?? 5);
        setShowReactSteps(data.showReactSteps !== false);
      })
      .catch((err) => {
        console.error('Failed to load settings:', err);
      });
  }, []);

  useEffect(() => {
    if (localTheme !== theme) {
      onThemeChange(localTheme);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTheme]);

  const showToast = useCallback((type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!apiUrl.trim()) {
      newErrors.apiUrl = 'API URL is required';
    } else {
      try {
        new URL(apiUrl.trim());
      } catch {
        newErrors.apiUrl = 'Please enter a valid URL';
      }
    }
    if (apiKeyDirty && !apiKey.trim()) {
      newErrors.apiKey = 'API Key is required';
    }
    if (!modelId.trim()) {
      newErrors.modelId = 'Model ID is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveSettings({
        apiUrl: apiUrl.trim(),
        ...(apiKeyDirty ? { apiKey: apiKey.trim() } : {}),
        modelId: modelId.trim(),
        systemPrompt: systemPrompt.trim(),
        thinkingMode,
        memoryEnabled,
        routingMode,
        reactMaxIterations,
        toolMaxRetries,
        showReactSteps,
      });
      showToast('success', '设置已保存');
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: '通用设置', icon: 'gear' as const },
    { id: 'endpoints', label: '模型端点', icon: 'server' as const },
    { id: 'mcp', label: 'MCP 服务', icon: 'plugin' as const },
    { id: 'agents', label: 'Agent 管理', icon: 'agent' as const },
    { id: 'memories', label: '记忆', icon: 'memory' as const },
  ];

  const tabIcon: Record<string, React.ReactNode> = {
    gear: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z" />
      </svg>
    ),
    server: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3h16a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm1 2v4h14V5H5zm-1 8h16a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6a1 1 0 011-1zm1 2v4h14v-4H5z" />
        <circle cx="7" cy="7" r="1" />
        <circle cx="7" cy="17" r="1" />
      </svg>
    ),
    plugin: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 8h-1V6c0-2.76-2.24-5-5-5S8 3.24 8 6v2H6c-1.66 0-3 1.34-3 3v8c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3v-8c0-1.66-1.34-3-3-3zm-8-2c0-1.1.9-2 2-2s2 .9 2 2v2h-4V6zm8 13c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-8c0-.55.45-1 1-1h12c.55 0 1 .45 1 1v8z" />
      </svg>
    ),
    agent: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
      </svg>
    ),
    memory: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
      </svg>
    ),
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Toast toast={toast} />
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>设置</h2>
        <div className="settings-body">
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tabIcon[tab.icon]}</span>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="settings-tab-content">
            {activeTab === 'general' && (
              <GeneralTab
                apiUrl={apiUrl}
                setApiUrl={setApiUrl}
                apiKey={apiKey}
                setApiKey={setApiKey}
                modelId={modelId}
                setModelId={setModelId}
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
                thinkingMode={thinkingMode}
                setThinkingMode={setThinkingMode}
                memoryEnabled={memoryEnabled}
                setMemoryEnabled={setMemoryEnabled}
                routingMode={routingMode}
                setRoutingMode={setRoutingMode}
                errors={errors}
                setErrors={setErrors}
                apiKeyDirty={apiKeyDirty}
                setApiKeyDirty={setApiKeyDirty}
                theme={localTheme}
                setTheme={setLocalTheme}
                reactMaxIterations={reactMaxIterations}
                setReactMaxIterations={setReactMaxIterations}
                toolMaxRetries={toolMaxRetries}
                setToolMaxRetries={setToolMaxRetries}
                showReactSteps={showReactSteps}
                setShowReactSteps={setShowReactSteps}
              />
            )}
            {activeTab === 'mcp' && (
              <McpServersPanel onToast={showToast} />
            )}
            {activeTab === 'agents' && (
              <AgentsPanel onToast={showToast} />
            )}
            {activeTab === 'memories' && (
              <MemoriesPanel onToast={showToast} />
            )}
            {activeTab === 'endpoints' && (
              <EndpointsPanel onToast={showToast} />
            )}
          </div>
        </div>
        {activeTab !== 'endpoints' && activeTab !== 'mcp' && activeTab !== 'agents' && activeTab !== 'memories' && (
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
