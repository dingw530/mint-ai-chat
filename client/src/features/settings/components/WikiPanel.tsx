import { useState, useEffect, useCallback } from 'react';
import { getWikiSchema, addWikiCategory, removeWikiCategory } from '@/services/api';
import type { WikiSchema } from '@/services/api/wiki';

interface WikiPanelProps {
  wikiPath: string;
  setWikiPath: (value: string) => void;
  onToast?: (type: 'success' | 'error', message: string) => void;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M10 2a1 1 0 00-1 1v1H5a1 1 0 000 2h14a1 1 0 100-2h-4V3a1 1 0 00-1-1h-4zm-3 6a1 1 0 00-1 1v10a2 2 0 002 2h8a2 2 0 002-2V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H14V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H8V9a1 1 0 00-1-1z" />
    </svg>
  );
}

export default function WikiPanel({ wikiPath, setWikiPath, onToast }: WikiPanelProps) {
  const [schema, setSchema] = useState<WikiSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState('');

  const fetchSchema = useCallback(async () => {
    if (!wikiPath) {
      setLoading(false);
      setSchema(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getWikiSchema();
      setSchema(data);
    } catch {
      setSchema(null);
    } finally {
      setLoading(false);
    }
  }, [wikiPath]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  const handleAddCategory = async () => {
    const cat = newCategory.trim();
    if (!cat) return;
    try {
      const result = await addWikiCategory(cat);
      setSchema((prev) => prev ? { ...prev, categories: result.categories } : { categories: result.categories });
      setNewCategory('');
      onToast?.('success', `分类 "${cat}" 已添加`);
    } catch (err) {
      onToast?.('error', (err as Error).message);
    }
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!window.confirm(`确定删除分类 "${cat}"？`)) return;
    try {
      const result = await removeWikiCategory(cat);
      setSchema((prev) => prev ? { ...prev, categories: result.categories } : { categories: result.categories });
      onToast?.('success', `分类 "${cat}" 已删除`);
    } catch (err) {
      onToast?.('error', (err as Error).message);
    }
  };

  const categories = schema?.categories || [];

  return (
    <div className="wiki-panel">
      <div className="form-group">
        <label htmlFor="wikiPath">Wiki 知识库路径</label>
        <input
          id="wikiPath"
          type="text"
          value={wikiPath}
          onChange={(e) => setWikiPath(e.target.value)}
          placeholder="/Users/me/my-wiki"
        />
        <p className="form-help">Agent 将在此目录下创建和维护知识页面。支持绝对路径，留空禁用 Wiki 功能。</p>
      </div>

      <hr className="settings-divider" />
      <h4 className="settings-subheading">分类管理</h4>
      <p className="form-help">管理 Wiki 页面分类。AI 在编译知识时会参考这些分类，你也可以手动添加预期分类。</p>

      {!wikiPath ? (
        <div className="wiki-categories-empty">请先配置知识库路径</div>
      ) : loading ? (
        <div className="panel-loading">加载中...</div>
      ) : (
        <>
          <div className="wiki-category-list">
            {categories.length === 0 ? (
              <div className="wiki-categories-empty">暂无分类，添加一个分类开始</div>
            ) : (
              categories.map((cat) => (
                <div key={cat} className="wiki-category-item">
                  <span className="wiki-category-name">{cat}</span>
                  <button
                    className="wiki-category-remove"
                    onClick={() => handleRemoveCategory(cat)}
                    title="删除分类"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="wiki-category-add">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="输入新分类名（如 ai-product）"
            />
            <button
              className="wiki-category-add-btn"
              onClick={handleAddCategory}
              disabled={!newCategory.trim()}
            >
              <PlusIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
