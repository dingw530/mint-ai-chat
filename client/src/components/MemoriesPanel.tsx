import { useState, useEffect, useCallback } from 'react';
import { getMemories, createMemory, updateMemory, deleteMemory } from '../services/api';
import type { Memory } from '../types';

const CATEGORIES = [
  { id: '', label: '全部', icon: '📋' },
  { id: 'personal', label: '个人信息', icon: '👤' },
  { id: 'preference', label: '偏好', icon: '❤️' },
  { id: 'feedback', label: '反馈', icon: '💬' },
  { id: 'project', label: '项目', icon: '📌' },
  { id: 'goal', label: '目标', icon: '🎯' },
  { id: 'general', label: '通用', icon: '📝' },
];

const CATEGORY_LABELS: Record<string, string> = {
  personal: '个人信息',
  preference: '偏好',
  feedback: '反馈',
  project: '项目',
  goal: '目标',
  general: '通用',
};

const emptyForm = { content: '', category: '' };

function formatDateTime(isoStr: string | undefined | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getBadgeLabel(category: string | undefined | null): string {
  return CATEGORY_LABELS[category || ''] || category || '通用';
}

function getBadgeClass(category: string | undefined | null): string {
  const cls = category || 'general';
  return CATEGORY_LABELS[cls] ? cls : 'general';
}

interface MemoriesPanelProps {
  onToast?: (type: 'success' | 'error', message: string) => void;
}

export default function MemoriesPanel({ onToast }: MemoriesPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMemories(activeCategory);
      setMemories(Array.isArray(data) ? data : []);
    } catch (err) {
      onToast?.('error', `加载记忆失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, onToast]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
  };

  const handleNew = () => {
    setEditingId('new');
    setForm({ ...emptyForm });
  };

  const handleEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setForm({
      content: memory.content || '',
      category: memory.category || '',
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const validate = (): string | null => {
    if (!form.content.trim()) return '请输入记忆内容';
    return null;
  };

  const handleSave = async () => {
    const errMsg = validate();
    if (errMsg) {
      onToast?.('error', errMsg);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        content: form.content.trim(),
      };
      if (form.category) payload.category = form.category;

      if (editingId === 'new') {
        await createMemory(payload);
        onToast?.('success', '记忆已创建');
      } else {
        await updateMemory(editingId as string, payload);
        onToast?.('success', '记忆已更新');
      }
      setEditingId(null);
      setForm({ ...emptyForm });
      fetchMemories();
    } catch (err) {
      onToast?.('error', `保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除此记忆？')) return;
    try {
      await deleteMemory(id);
      onToast?.('success', '记忆已删除');
      if (editingId === id) {
        setEditingId(null);
        setForm({ ...emptyForm });
      }
      fetchMemories();
    } catch (err) {
      onToast?.('error', `删除失败: ${(err as Error).message}`);
    }
  };

  const isFormVisible = editingId !== null;

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="memories-panel">
      <div className="category-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`category-btn${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {editingId !== 'new' && (
        <button className="add-memory-btn" onClick={handleNew}>
          + 添加记忆
        </button>
      )}

      {isFormVisible && (
        <div className="memory-form" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>内容</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="输入记忆内容..."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>分类</label>
            <select
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              <option value="">通用</option>
              <option value="personal">个人信息</option>
              <option value="preference">偏好</option>
              <option value="feedback">反馈</option>
              <option value="project">项目</option>
              <option value="goal">目标</option>
            </select>
          </div>
          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancel}>取消</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {memories.length === 0 ? (
        <div className="memory-empty">
          <p>暂无记忆</p>
          <p>开启记忆功能后，AI 会自动从对话中提取关键信息。</p>
        </div>
      ) : (
        memories.map((memory) => {
          const isEditing = editingId === memory.id;
          if (isEditing) return null;
          return (
            <div key={memory.id} className="memory-card">
              <div className="memory-card-header">
                <span className={`memory-badge ${getBadgeClass(memory.category)}`}>
                  {getBadgeLabel(memory.category)}
                </span>
                <div className="memory-actions">
                  <button className="edit-btn" onClick={() => handleEdit(memory)} title="编辑">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                    </svg>
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(memory.id)} title="删除">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="memory-content">{memory.content}</div>
              <div className="memory-meta">
                {formatDateTime(memory.createdAt)}
                {memory.sourceConversationId && ' · 来源对话'}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
