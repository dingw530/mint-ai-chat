import { useState, useRef, useEffect, KeyboardEvent, FormEvent } from 'react';
import SelectField from '@/shared/components/SelectField';

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

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
    </svg>
  );
}

interface ImageSendParams {
  content: string;
  endpointId: string;
  size: string;
  quality: string;
  output_format: string;
}

interface ImageInputBarProps {
  imageEndpoints: Array<{ id: string; name: string; modelId: string }>;
  onSend: (params: ImageSendParams) => void;
  sending: boolean;
}

export default function ImageInputBar({ imageEndpoints, onSend, sending }: ImageInputBarProps) {
  const [text, setText] = useState('');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('auto');
  const [format, setFormat] = useState('png');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isCompositing = useRef(false);

  useEffect(() => {
    if (imageEndpoints.length > 0 && !selectedEndpointId) {
      setSelectedEndpointId(imageEndpoints[0].id);
    }
  }, [imageEndpoints, selectedEndpointId]);

  useEffect(() => {
    if (!sending && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [sending]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending || !selectedEndpointId) return;
    onSend({
      content: trimmed,
      endpointId: selectedEndpointId,
      size,
      quality,
      output_format: format,
    });
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isCompositing.current) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  return (
    <div className="image-input-bar">
      <form onSubmit={handleSubmit}>
        <div className="image-input-model-row">
          <SelectField
            options={imageEndpoints.map((ep) => ({ value: ep.id, label: `${ep.name} (${ep.modelId})` }))}
            value={selectedEndpointId}
            onChange={setSelectedEndpointId}
            disabled={sending}
            className="small"
            placeholder="选择模型"
          />
        </div>

        <div className="image-input-params">
          <div className="image-input-param-group">
            <label>尺寸</label>
            <SelectField options={SIZES} value={size} onChange={setSize} disabled={sending} className="small" />
          </div>
          <div className="image-input-param-group">
            <label>质量</label>
            <SelectField options={QUALITY_OPTIONS} value={quality} onChange={setQuality} disabled={sending} className="small" />
          </div>
          <div className="image-input-param-group">
            <label>格式</label>
            <SelectField options={FORMAT_OPTIONS} value={format} onChange={setFormat} disabled={sending} className="small" />
          </div>
        </div>

        <div className="image-input-row">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isCompositing.current = true; }}
            onCompositionEnd={() => { isCompositing.current = false; }}
            placeholder="描述你想要生成的图片..."
            rows={1}
            disabled={sending}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={sending || !text.trim() || !selectedEndpointId}
            aria-label="发送"
          >
            {sending ? (
              <span className="spinner" />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
