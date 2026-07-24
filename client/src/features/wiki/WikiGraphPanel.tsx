import { useRef, useEffect, useState, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { getGraphData, searchGraphNodes } from '@/services/api';
import type { GraphNode, GraphEdge } from '@/services/api/wiki';
import GraphCandidatePanel from './GraphCandidatePanel';

// ── 节点类型样式 ──

const NODE_PALETTE: Record<string, { bg: string; border: string; highlightBg: string }> = {
  实践: { bg: '#FDE68A', border: '#F59E0B', highlightBg: '#FCD34D' },
  思维模式: { bg: '#FBCFE8', border: '#DB2777', highlightBg: '#F9A8D4' },
  方法论: { bg: '#BBF7D0', border: '#10B981', highlightBg: '#6EE7B7' },
  概念: { bg: '#BFDBFE', border: '#3B82F6', highlightBg: '#93C5FD' },
  // 兼容迁移前的旧节点，重建图谱后会统一为 Schema 分类名称。
  concept: { bg: '#BFDBFE', border: '#3B82F6', highlightBg: '#93C5FD' },
  practice: { bg: '#FDE68A', border: '#F59E0B', highlightBg: '#FCD34D' },
  methodology: { bg: '#BBF7D0', border: '#10B981', highlightBg: '#6EE7B7' },
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

  return (
    <div className="graph-node-detail">
      <div className="graph-node-detail-header">
        <h3 className="graph-node-detail-title">{node.label}</h3>
        <button className="graph-node-detail-close" onClick={onClose} aria-label="关闭">
          &times;
        </button>
      </div>
      <div className="graph-node-detail-body">
        <div className="graph-node-detail-field">
          <span className="graph-node-detail-label">类型</span>
          <span className="graph-node-detail-value">{node.type}</span>
        </div>
        {node.sourceFile && (
          <div className="graph-node-detail-field">
            <span className="graph-node-detail-label">来源文件</span>
            <span
              className="graph-node-detail-value graph-node-detail-link"
              onClick={() => onOpenFile?.(node.sourceFile!)}
            >
              {node.sourceFile}
            </span>
          </div>
        )}
        {Object.keys(node.properties).length > 0 && (
          <div className="graph-node-detail-field">
            <span className="graph-node-detail-label">属性</span>
            <pre className="graph-node-detail-props">
              {JSON.stringify(node.properties, null, 2)}
            </pre>
          </div>
        )}
      </div>
      {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
        <div className="graph-node-detail-relations">
          <h4 className="graph-node-detail-section-title">关系</h4>
          {outgoingEdges.map((e) => {
            const target = allNodes.find((n) => n.id === e.targetId);
            const weak = e.properties.strength === 'weak' || e.relation === 'references';
            return (
              <div key={e.id} className="graph-node-detail-relation">
                <span className="graph-node-detail-relation-arrow">→</span>
                <span className="graph-node-detail-relation-label">
                  {weak ? '关联（弱）' : e.relation}
                </span>
                {target && (
                  <span className="graph-node-detail-relation-node">→ {target.label}</span>
                )}
              </div>
            );
          })}
          {incomingEdges.map((e) => {
            const source = allNodes.find((n) => n.id === e.sourceId);
            const weak = e.properties.strength === 'weak' || e.relation === 'references';
            return (
              <div key={e.id} className="graph-node-detail-relation">
                <span className="graph-node-detail-relation-arrow">←</span>
                <span className="graph-node-detail-relation-label">
                  {weak ? '关联（弱）' : e.relation}
                </span>
                {source && (
                  <span className="graph-node-detail-relation-node">← {source.label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 工具：获取节点的原始颜色 ──

export function getFadedColor(bg: string): string {
  // 将 hex 转成半透明 rgba（~10% 不透明度）
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

/** 画布优先保证图形可读性，完整标题由悬停提示和详情面板承载。 */
export function getGraphNodeLabel(label: string): string {
  const maxLength = 16;
  return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
}

export function isWeakGraphEdge(edge: GraphEdge): boolean {
  return edge.properties.strength === 'weak' || edge.relation === 'references';
}

export function getGraphEdgeWidth(edge: GraphEdge): number {
  if (isWeakGraphEdge(edge)) return 0.6;
  const confidence =
    typeof edge.properties.confidence === 'number' ? edge.properties.confidence : 0.55;
  return 0.7 + confidence * 0.4;
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
  const originalColorsRef = useRef<Map<string, { bg: string; border: string }>>(new Map());
  const initialLayoutCompleteRef = useRef(false);
  const userInteractedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeEdges, setSelectedNodeEdges] = useState<GraphEdge[]>([]);
  const [graphStats, setGraphStats] = useState({ nodes: 0, semanticEdges: 0, weakReferences: 0 });
  const [panel, setPanel] = useState<'graph' | 'candidates'>('graph');

  useEffect(() => {
    const edges = edgesRef.current;
    if (!edges) return;

    edges.forEach((edge: any) => {
      const graphEdge = allEdgesRef.current.find((item) => item.id === edge.id);
      if (!graphEdge || !isWeakGraphEdge(graphEdge)) return;
      const isConnected =
        !!selectedNode &&
        (graphEdge.sourceId === selectedNode.id || graphEdge.targetId === selectedNode.id);
      edges.update({ id: graphEdge.id, hidden: !isConnected });
    });
  }, [selectedNode]);

  useEffect(() => {
    if (panel !== 'graph') return;

    let network: Network | null = null;

    async function init() {
      setLoading(true);
      setError(null);
      initialLayoutCompleteRef.current = false;
      userInteractedRef.current = false;
      try {
        const raw = await getGraphData();
        allNodesRef.current = raw.nodes;
        allEdgesRef.current = raw.edges;
        const weakReferences = raw.edges.filter(
          (edge) => edge.relation === 'references' || edge.properties.strength === 'weak',
        ).length;
        setGraphStats({
          nodes: raw.nodes.length,
          semanticEdges: raw.edges.length - weakReferences,
          weakReferences,
        });

        if (raw.nodes.length === 0) {
          setLoading(false);
          return;
        }

        const container = containerRef.current;
        if (!container) {
          setLoading(false);
          return;
        }
        const parent = container.parentElement;
        if (!parent) {
          setLoading(false);
          return;
        }
        // ── vis-network DataSet ──

        const origColors = new Map<string, { bg: string; border: string }>();
        const nodes = new DataSet(
          raw.nodes.map((n) => {
            const p = NODE_PALETTE[n.type] || {
              bg: '#f0f0f0',
              border: '#999',
              highlightBg: '#ddd',
            };
            origColors.set(n.id, { bg: p.bg, border: p.bg });
            return {
              id: n.id,
              label: getGraphNodeLabel(n.label),
              title: n.label,
              shape: 'dot',
              size: 13,
              color: {
                background: p.bg,
                border: p.bg,
                highlight: { background: p.highlightBg, border: p.highlightBg },
                hover: { background: p.highlightBg, border: p.highlightBg },
              },
              borderWidth: 0,
              borderWidthSelected: 0,
              shadow: false,
              font: { size: 11, color: '#475569' },
            };
          }),
        );
        originalColorsRef.current = origColors;

        const edges = new DataSet(
          raw.edges.map((e) => {
            const weak = isWeakGraphEdge(e);
            const confidence =
              typeof e.properties.confidence === 'number'
                ? e.properties.confidence
                : weak
                  ? 0.25
                  : 0.55;
            return {
              id: e.id,
              from: e.sourceId,
              to: e.targetId,
              hidden: weak,
              label: '',
              color: weak
                ? { color: '#C3CBD3', opacity: 0.35, inherit: false }
                : { color: '#7A8795', opacity: 0.45 + confidence * 0.35, inherit: false },
              width: getGraphEdgeWidth(e),
              dashes: weak ? [5, 5] : false,
              smooth: { type: 'curvedCW', roundness: 0.15 },
              arrows: { to: { enabled: !weak, scaleFactor: 0.8 } },
              font: { size: 11, color: weak ? '#9AA5B1' : '#555', align: 'middle' },
            };
          }),
        );

        nodesRef.current = nodes;
        edgesRef.current = edges;

        // ── Network ──

        network = new Network(
          container,
          { nodes, edges },
          {
            nodes: {
              shape: 'dot',
              size: 13,
              borderWidth: 0,
              borderWidthSelected: 0,
              shadow: false,
              font: { size: 11, color: '#475569' },
            },
            edges: {
              smooth: { type: 'curvedCW', roundness: 0.15 },
              color: { color: '#b0b0b0', opacity: 0.55, inherit: false },
              width: 1,
              arrows: { to: { enabled: true, scaleFactor: 0.8 } },
              font: { size: 11, color: '#555', align: 'middle' },
            },
            layout: {
              improvedLayout: false,
            },
            physics: {
              solver: 'forceAtlas2Based',
              forceAtlas2Based: {
                gravitationalConstant: -35,
                centralGravity: 0.002,
                springLength: 160,
                springConstant: 0.04,
                damping: 0.95,
              },
              stabilization: {
                enabled: true,
                iterations: 600,
                updateInterval: 50,
                fit: false,
              },
            },
            interaction: {
              hover: true,
              tooltipDelay: 200,
              dragNodes: true,
              dragView: true,
              zoomView: true,
            },
          },
        );

        networkRef.current = network;
        const fitNetwork = () => {
          network?.fit({ animation: false, padding: 160 });
        };

        const handleStabilized = () => {
          initialLayoutCompleteRef.current = true;
          fitNetwork();
          network?.setOptions({ physics: { enabled: false } });
          network?.off('stabilized', handleStabilized);
        };
        network.on('stabilized', handleStabilized);

        const markUserInteraction = () => {
          userInteractedRef.current = true;
        };
        network.on('dragStart', markUserInteraction);
        network.on('zoom', markUserInteraction);

        // ── 点击节点 ──
        network.on('click', (params: any) => {
          const { nodes: clickedNodes } = params;
          const nodeId = clickedNodes?.[0];

          if (nodeId) {
            const gn = allNodesRef.current.find((n) => n.id === nodeId);
            if (gn) {
              const nodeEdges = allEdgesRef.current.filter(
                (e) => e.sourceId === nodeId || e.targetId === nodeId,
              );
              setSelectedNode(gn);
              setSelectedNodeEdges(nodeEdges);
            }
          } else {
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
                nodes.update({
                  id: n.id,
                  color: {
                    background: getFadedColor(orig.bg),
                    border: getFadedColor(orig.border),
                    highlight: {
                      background: getFadedColor(orig.bg),
                      border: getFadedColor(orig.border),
                    },
                    hover: {
                      background: getFadedColor(orig.bg),
                      border: getFadedColor(orig.border),
                    },
                  },
                });
              }
            }
          });
          edges.forEach((e: any) => {
            const connected = connectedEdges.includes(e.id);
            edges.update({
              id: e.id,
              color: {
                color: connected ? '#666' : '#e0e0e0',
                opacity: connected ? 0.9 : 0.08,
                inherit: false,
              },
              width: connected ? 1.2 : 0.5,
            });
          });
        });

        network.on('blurNode', () => {
          nodes.forEach((n: any) => {
            const orig = originalColorsRef.current.get(n.id);
            const gn = allNodesRef.current.find((gn) => gn.id === n.id);
            if (orig && gn) {
              const p = NODE_PALETTE[gn.type] || {
                bg: '#f0f0f0',
                border: '#999',
                highlightBg: '#ddd',
              };
              nodes.update({
                id: n.id,
                color: {
                  background: orig.bg,
                  border: orig.border,
                  highlight: { background: p.highlightBg, border: orig.border },
                  hover: { background: p.highlightBg, border: orig.border },
                },
              });
            }
          });
          edges.forEach((e: any) => {
            const graphEdge = allEdgesRef.current.find((item) => item.id === e.id);
            edges.update({
              id: e.id,
              color: { color: '#b0b0b0', opacity: 0.55, inherit: false },
              width: graphEdge ? getGraphEdgeWidth(graphEdge) : 1,
            });
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
          if (!initialLayoutCompleteRef.current && !userInteractedRef.current) {
            requestAnimationFrame(() => {
              if (!initialLayoutCompleteRef.current && !userInteractedRef.current) {
                fitNetwork();
              }
            });
          }
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
  }, [panel]);

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
          nodes.update({
            id: n.id,
            color: {
              background: orig.bg,
              border: orig.border,
              highlight: { background: p.highlightBg, border: orig.border },
              hover: { background: p.highlightBg, border: orig.border },
            },
          });
        } else {
          nodes.update({
            id: n.id,
            color: {
              background: getFadedColor(orig.bg),
              border: getFadedColor(orig.border),
              highlight: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) },
              hover: { background: getFadedColor(orig.bg), border: getFadedColor(orig.border) },
            },
          });
        }
      });
    } catch {
      /* ignore */
    }
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="48"
              height="48"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="5" cy="5" r="2" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
              <line x1="9" y1="9" x2="7" y2="7" />
              <line x1="15" y1="9" x2="17" y2="7" />
              <line x1="9" y1="15" x2="7" y2="17" />
              <line x1="15" y1="15" x2="17" y2="17" />
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
          <svg
            className="wiki-graph-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="14"
            height="14"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="wiki-graph-search-input"
            placeholder="搜索节点..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="wiki-graph-stats" aria-label="图谱统计">
          <span>
            <strong>{graphStats.nodes}</strong> 节点
          </span>
          <span>
            <strong>{graphStats.semanticEdges}</strong> 语义边
          </span>
          <span>
            <strong>{graphStats.weakReferences}</strong> 关联
          </span>
        </div>
        <div className="wiki-graph-view-switch">
          <button
            className={panel === 'graph' ? 'is-active' : ''}
            onClick={() => setPanel('graph')}
          >
            图谱
          </button>
          <button
            className={panel === 'candidates' ? 'is-active' : ''}
            onClick={() => setPanel('candidates')}
          >
            候选
          </button>
        </div>
        {error && <span className="wiki-graph-error">{error}</span>}
        {loading && <span className="wiki-graph-loading">加载中...</span>}
      </div>
      {panel === 'graph' && <div ref={containerRef} className="wiki-graph-canvas" />}
      {panel === 'candidates' && <GraphCandidatePanel />}
      {panel === 'graph' && (
        <NodeDetailPanel
          node={selectedNode}
          edges={selectedNodeEdges}
          allNodes={allNodesRef.current}
          onClose={() => setSelectedNode(null)}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
}
