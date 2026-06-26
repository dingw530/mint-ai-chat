import React from 'react';

type StringSetter = (value: string) => void;
type BooleanSetter = (value: boolean) => void;
type NumberSetter = (value: number) => void;

export interface GeneralTabProps {
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

export default function GeneralTab({
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
          <button type="button" className={!memoryEnabled ? 'active' : ''} onClick={() => setMemoryEnabled(false)}>关闭</button>
          <button type="button" className={memoryEnabled ? 'active' : ''} onClick={() => setMemoryEnabled(true)}>开启</button>
        </div>
        <p className="form-help">开启后，AI 会从对话中提取关键信息并在后续对话中参考。</p>
      </div>
      <div className="form-group">
        <label>路由模式</label>
        <div className="mode-toggle">
          <button type="button" className={routingMode === 'auto' ? 'active' : ''} onClick={() => setRoutingMode('auto')}>自动</button>
          <button type="button" className={routingMode === 'manual' ? 'active' : ''} onClick={() => setRoutingMode('manual')}>手动</button>
        </div>
        <p className="form-help">自动模式下，AI 会根据消息内容自动选择合适的 Agent。</p>
      </div>
      <div className="form-group">
      </div>
      <div className="form-group">
        <label>主题皮肤</label>
        <div className="mode-toggle">
          <button type="button" className={theme === 'mint' ? 'active' : ''} onClick={() => setTheme('mint')}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#2AA87D', marginRight: 6, verticalAlign: 'middle' }}></span>
            Mint 沁绿
          </button>
          <button type="button" className={theme === 'snow' ? 'active' : ''} onClick={() => setTheme('snow')}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#727CC6', marginRight: 6, verticalAlign: 'middle' }}></span>
            蓝雪花
          </button>
          <button type="button" className={theme === 'anthropic' ? 'active' : ''} onClick={() => setTheme('anthropic')}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#E18C6E', marginRight: 6, verticalAlign: 'middle' }}></span>
            Anthropic
          </button>
          <button type="button" className={theme === 'reddot' ? 'active' : ''} onClick={() => setTheme('reddot')}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#D03050', marginRight: 6, verticalAlign: 'middle' }}></span>
            炽红
          </button>
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
          <button type="button" className={showReactSteps ? 'active' : ''} onClick={() => setShowReactSteps(true)}>显示</button>
          <button type="button" className={!showReactSteps ? 'active' : ''} onClick={() => setShowReactSteps(false)}>隐藏</button>
        </div>
        <p className="form-help">控制 ReAct 推理过程中工具调用的步骤信息是否在对话中展示。</p>
      </div>
    </>
  );
}
