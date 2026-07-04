import { useRef, useEffect, useState, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { getGraphData, searchGraphNodes } from '@/services/api';
import type { GraphNode, GraphEdge } from '@/services/api/wiki';

// ── 节点类型样式 ──

const NODE_PALETTE: Record<string, { bg: string; border: string; highlightBg: string }> = {
  concept: { bg: '#DBEAFE', border: '#3B82F6', highlightBg: '#93C5FD' },
  practice: { bg: '#FEF3C7', border: '#F59E0B', highlightBg: '#FCD34D' },
  methodology: { bg: '#D1FAE5', border: '#10B981', highlightBg: '#6EE7B7' },
};

// ── 子组件：节点详情面板 ──

interface NodeDetailProps {
  node: GraphNode | null;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

function NodeDetailPanel({ node, edges, allNodes, onClose, onOpenFile }: NodeDetailProps) {
  if (!node) return null;
  const outgoingEdges = edges.filter((e) => e.sourceId === node.id);
  const incomingEdges = edges.filter((e) => e.targetId === node.id);
  const typeLabel: Record<string, string> = { concept: '概念', practice: '实践', methodology: '方法论' };

  return (
    <div className="graph-node-detail">
      <div className="graph-node-detail-header">
        <h3 className="graph-node-detail-title">{node.label}</h3>
        <button className="graph-node-detail-close" onClick={onClose} aria-label="关闭">&times;</button>
      </div>
      <div className="graph-node-detail-body">
        <div className="graph-node-detail-field">
          <span className="graph-node-detail-label">类型</span>
          <span className="graph-node-detail-value">{typeLabel[node.type] || node.type}</span>
        </div>
        {node.sourceFile && (
          <div className="graph-node-detail-field">
            <span className="graph-node-detail-label">来源文件</span>
            <span className="graph-node-detail-value graph-node-detail-link" onClick={() => onOpenFile?.(node.sourceFile!)}>
              {node.sourceFile}
            </span>
          </div>
        )}
        {Object.keys(node.properties).length > 0 && (
          <div className="graph-node-detail-field">
            <span className="graph-node-detail-label">属性</span>
            <pre className="graph-node-detail-props">{JSON.stringify(node.properties, null, 2)}</pre>
          </div>
        )}
      </div>
      {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
        <div className="graph-node-detail-relations">
          <h4 className="graph-node-detail-section-title">关系</h4>
          {outgoingEdges.map((e) => {
            const target = allNodes.find(n => n.id === e.targetId);
            return (
              <div key={e.id} className="graph-node-detail-relation">
                <span className="graph-node-detail-relation-arrow">→</span>
                <span className="graph-node-detail-relation-label">{e.relation}</span>
                {target && <span className="graph-node-detail-relation-node">→ {target.label}</span>}
              </div>
            );
          })}
          {incomingEdges.map((e) => {
            const source = allNodes.find(n => n.id === e.sourceId);
            return (
              <div key={e.id} className="graph-node-detail-relation">
                <span className="graph-node-detail-relation-arrow">←</span>
                <span className="graph-node-detail-relation-label">{e.relation}</span>
                {source && <span className="graph-node-detail-relation-node">← {source.label}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 工具：获取节点的原始颜色 ──

function getFadedColor(bg: string): string {
  // 将 hex 转成半透明 rgba（~10% 不透明度）
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

// ── 主组件 ──

interface WikiGraphPanelProps {
  onOpenFile?: (path: string) => void;
}

export default function WikiGraphPanel({ onOpenFile }: WikiGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<any> | null>(null);
  const edgesRef = useRef<DataSet<any> | null>(null);
  const allNodesRef = useRef<GraphNode[]>([]);
  const allEdgesRef = useRef<GraphEdge[]>([]);
  const prevSelectedRef = useRef<string | null>(null);
  const originalColorsRef = useRef<Map<string, { bg: string; border: string }>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeEdges, setSelectedNodeEdges] = useState<GraphEdge[]>([]);

  useEffect(() => {
    let network: Network | null = null;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const raw = await getGraphData();
        allNodesRef.current = raw.nodes;
        allEdgesRef.current = raw.edges;

        if (raw.nodes.length === 0) { setLoading(false); return; }

        const container = containerRef.current;
        if (!container) { setLoading(false); return; }
        const parent = container.parentElement;
        if (!parent) { setLoading(false); return; }
        const rect = parent.getBoundingClientRect();
        const width = rect.width;
        const height = Math.max(rect.height - 40, 200);

        // ── vis-network DataSet ──

        const origColors = new Map<string, { bg: string; border: string }>();
        const nodes = new DataSet(
          raw.nodes.map((n) => {
            const p = NODE_PALETTE[n.type] || { bg: '#f0f0f0', border: '#999', highlightBg: '#ddd' };
            origColors.set(n.id, { bg: p.bg, border: p.border });
            return {
              id: n.id,
              label: n.label,
              shape: 'dot',
              size: 26,
              color: {
                background: p.bg,
                border: p.border,
                highlight: { background: p.highlightBg, border: p.border },
                hover: { background: p.highlightBg, border: p.border },
              },
              borderWidth: 2,
              borderWidthSelected: 3,
              shadow: { enabled: true, size: 8, x: 0, y: 2, color: 'rgba(0,0,0,0.08)' },
              font: { size: 17, color: '#333' },
            };
          })
        );
        originalColorsRef.current = origColors;

        const edges = new DataSet(
          raw.edges.map((e) => ({
            id: e.id,
            from: e.sourceId,
            to: e.targetId,
            label: e.relation,
            color: { color: '#b0b0b0', opacity: 0.55, inherit: false },
            width: 1.5,
            smooth: { type: 'curvedCW', roundness: 0.15 },
            arrows: { to: { enabled: true, scaleFactor: 0.8 } },
            font: { size: 14, color: '#555', align: 'middle' },
          }))
        );

        nodesRef.current = nodes;
        edgesRef.current = edges;

        // ── Network ──

        network = new Network(container, { nodes, edges }, {
          nodes: {
            shape: 'dot',
            size: 26,
            borderWidth: 2,
            borderWidthSelected: 3,
            shadow: { enabled: true, size: 8, x: 0, y: 2, color: 'rgba(0,0,0,0.08)' },
            font: { size: 17, color: '#333' },
          },
          edges: {
            smooth: { type: 'curvedCW', roundness: 0.15 },
            color: { color: '#b0b0b0', opacity: 0.55, inherit: false },
            width: 1.5,
            arrows: { to: { enabled: true, scaleFactor: 0.8 } },
            font: { size: 14, color: '#555', align: 'middle' },
          },
          physics: {
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
              gravitationalConstant: -80,
              centralGravity: 0.005,
              springLength: 120,
              springConstant: 0.3,
              damping: 0.9,
            },
            stabilization: { iterations: 150, updateInterval: 25 },
          },
          interaction: {
            hover: true,
            tooltipDelay: 200,
            dragNodes: true,
            dragView: true,
            zoomView: true,
          },
        });

        networkRef.current = network;

        // ── 点击节点 ──
        network.on('click', (params: any) => {
          const { nodes: clickedNodes } = params;
          const nodeId = clickedNodes?.[0];

          if (nodeId) {
            prevSelectedRef.current = nodeId;

            const gn = allNodesRef.current.find((n) => n.id === nodeId);
            if (gn) {
              const nodeEdges = allEdgesRef.current.filter(
                (e) => e.sourceId === nodeId || e.targetId === nodeId
              );
              setSelectedNode(gn);
              setSelectedNodeEdges(nodeEdges);
            }
          } else {
            prevSelectedRef.current = null;
            setSelectedNode(null);
            setSelectedNodeEdges([]);
          }
        });

        // ── 悬停高亮 ──
        network.on('hoverNode', (params: any) => {
          const nodeId = params.node;
          const connectedNodes: string[] = network?.getConnectedNodes(nodeId) ?? [];
          const connectedEdges: string[] = network?.getConnectedEdges(nodeId) ?? [];
          const connectedSet = new Set([nodeId, ...connectedNodes]);

          nodes.forEach((n: any) => {
            if (!connectedSet.has(n.id)) {
              const orig = originalColorsRef.current.get(n.id);
              if (orig) {
                nodes.update({ id: n.id, color: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border), highlight: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) }, hover: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) } } });
              }
            }
          });
          edges.forEach((e: any) => {
            const connected = connectedEdges.includes(e.id);
            edges.update({ id: e.id, color: { color: connected ? '#666' : '#e0e0e0', opacity: connected ? 0.9 : 0.08, inherit: false }, width: connected ? 2.5 : 1.5 });
          });
        });

        network.on('blurNode', () => {
          nodes.forEach((n: any) => {
            const orig = originalColorsRef.current.get(n.id);
            const gn = allNodesRef.current.find((gn) => gn.id === n.id);
            if (orig && gn) {
              const p = NODE_PALETTE[gn.type] || { bg: '#f0f0f0', border: '#999', highlightBg: '#ddd' };
              nodes.update({ id: n.id, color: { background: orig.bg, border: orig.border, highlight: { background: p.highlightBg, border: orig.border }, hover: { background: p.highlightBg, border: orig.border } } });
            }
          });
          edges.forEach((e: any) => {
            edges.update({ id: e.id, color: { color: '#b0b0b0', opacity: 0.55, inherit: false }, width: 1.5 });
          });
        });

        // ── Resize ──
        const parentEl = container.parentElement;
        const ro = new ResizeObserver((entries) => {
          if (!network || !container) return;
          const entry = entries[0];
          if (!entry) return;
          const { width: w, height: h } = entry.contentRect;
          network.setSize(`${w}px`, `${Math.max(h - 40, 200)}px`);
        });
        if (parentEl) ro.observe(parentEl);

        return () => {
          ro.disconnect();
        };
      } catch (err) {
        setError((err as Error).message || '加载图谱失败');
      } finally {
        setLoading(false);
      }
    }

    const cleanupPromise = init();
    return () => {
      cleanupPromise?.then((fn) => fn?.());
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, []);

  // ── 搜索过滤 ──

  const handleSearch = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const q = searchQuery.trim().toLowerCase();
    try {
      nodes.forEach((n: any) => {
          const gn = allNodesRef.current.find((gn) => gn.id === n.id);
          if (!gn) return;
          const orig = originalColorsRef.current.get(n.id);
          if (!orig) return;
          if (!q || gn.label.toLowerCase().includes(q)) {
            const p = NODE_PALETTE[gn.type] || { bg: '#f0f0f0', border: '#999', highlightBg: '#ddd' };
            nodes.update({ id: n.id, color: { background: orig.bg, border: orig.border, highlight: { background: p.highlightBg, border: orig.border }, hover: { background: p.highlightBg, border: orig.border } } });
          } else {
            nodes.update({ id: n.id, color: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border), highlight: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) }, hover: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) } } });
          }
        });
    } catch { /* ignore */ }
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(handleSearch, 200);
    return () => clearTimeout(t);
  }, [handleSearch]);

  // ── 空状态 ──

  if (!loading && !error && allNodesRef.current.length === 0) {
    return (
      <div className="wiki-graph-container">
        <div className="wiki-graph-empty">
          <div className="wiki-graph-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
              <circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
              <line x1="9" y1="9" x2="7" y2="7" /><line x1="15" y1="9" x2="17" y2="7" />
              <line x1="9" y1="15" x2="7" y2="17" /><line x1="15" y1="15" x2="17" y2="17" />
              <line x1="12" y1="15" x2="12" y2="12" />
            </svg>
          </div>
          <h3>暂无图谱数据</h3>
          <p>可通过 AI 对话添加实体和关系，或通过 API 手动录入</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-graph-container">
      <div className="wiki-graph-toolbar">
        <div className="wiki-graph-search-box">
          <svg className="wiki-graph-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" className="wiki-graph-search-input" placeholder="搜索节点..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {error && <span className="wiki-graph-error">{error}</span>}
        {loading && <span className="wiki-graph-loading">加载中...</span>}
      </div>
      <div ref={containerRef} className="wiki-graph-canvas" />
      <NodeDetailPanel
        node={selectedNode}
        edges={selectedNodeEdges}
        allNodes={allNodesRef.current}
        onClose={() => setSelectedNode(null)}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}