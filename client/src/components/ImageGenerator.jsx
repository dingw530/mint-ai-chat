import { useState, useEffect } from 'react';
import { generateImage } from '../services/api';

const SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x2048',
  '3840x2160',
];

const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
];

export default function ImageGenerator({ endpoints, onOpenSettings }) {
  const [imageEndpoints, setImageEndpoints] = useState([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('auto');
  const [format, setFormat] = useState('png');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const imageEps = (endpoints || []).filter((ep) => ep.category === 'image');
    setImageEndpoints(imageEps);
    if (imageEps.length > 0 && !selectedEndpointId) {
      setSelectedEndpointId(imageEps[0].id);
    }
  }, [endpoints, selectedEndpointId]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!selectedEndpointId) return;

    setGenerating(true);
    setResult(null);
    setError(null);

    try {
      const data = await generateImage({
        endpointId: selectedEndpointId,
        prompt: prompt.trim(),
        size,
        quality,
        output_format: format,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
  };

  if (imageEndpoints.length === 0) {
    return (
      <div className="image-generator">
        <div className="image-gen-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <h3>暂无图片生成模型</h3>
          <p>请先在设置中配置一个分类为"图片生成"的模型端点。</p>
          <button className="btn-primary" onClick={onOpenSettings}>前往设置</button>
        </div>
      </div>
    );
  }

  return (
    <div className="image-generator">
      <div className="image-gen-header">
        <h2>图片生成</h2>
        <p className="image-gen-subtitle">输入提示词，让 AI 为你生成图像</p>
      </div>

      <div className="image-gen-content">
        {/* 输入面板 */}
        <div className="image-gen-panel">
          {/* 模型选择 */}
          <div className="form-group">
            <label>图片模型</label>
            <select
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              className="image-gen-select"
            >
              {imageEndpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.modelId})
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div className="form-group">
            <label>描述提示词</label>
            <textarea
              className="image-gen-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想要生成的图片，如：一只橘猫戴着橙色围巾抱着水獭，温暖插画风格"
              rows={4}
            />
            <p className="image-gen-hint">
              <kbd>⌘Enter</kbd> 快速生成
            </p>
          </div>

          {/* 参数配置 */}
          <div className="image-gen-params">
            <div className="form-group">
              <label>尺寸</label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className="image-gen-select">
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>质量</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} className="image-gen-select">
                {QUALITY_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>格式</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="image-gen-select">
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 生成按钮 */}
          <button
            className="btn-primary image-gen-btn"
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || !selectedEndpointId}
          >
            {generating ? (
              <>
                <span className="spinner" />
                生成中...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                生成图片
              </>
            )}
          </button>
        </div>

        {/* 错误信息 */}
        {error && (
          <div className="image-gen-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 结果展示 */}
        {result && result.data && result.data.length > 0 && (
          <div className="image-gen-result">
            <div className="image-gen-result-header">
              <h3>生成结果</h3>
              <span className="image-gen-result-count">共 {result.data.length} 张</span>
            </div>
            {result.data.map((item, index) => (
              <div key={index} className="image-gen-result-item">
                <div className="image-gen-image-wrapper">
                  <img
                    src={item.url}
                    alt={item.revised_prompt || `生成图片 ${index + 1}`}
                    className="image-gen-image"
                  />
                  {result.data.length > 1 && (
                    <span className="image-gen-image-badge">#{index + 1}</span>
                  )}
                </div>
                {item.revised_prompt && (
                  <details className="image-gen-revised-prompt" open={result.data.length === 1}>
                    <summary>优化后的提示词</summary>
                    <p>{item.revised_prompt}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
