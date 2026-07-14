import { useEffect, useState } from 'react';
import {
  acceptGraphCandidate,
  listGraphCandidates,
  rejectGraphCandidate,
  type GraphEdgeCandidate,
} from '@/services/api/wiki';

export default function GraphCandidatePanel() {
  const [items, setItems] = useState<GraphEdgeCandidate[]>([]);
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected' | 'expired'>('pending');
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    listGraphCandidates(status)
      .then(setItems)
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, [status]);
  const accept = async (id: string) => {
    await acceptGraphCandidate(id);
    load();
  };
  const reject = async (id: string) => {
    await rejectGraphCandidate(id);
    load();
  };
  return (
    <div className="graph-candidates">
      <div className="graph-candidates-toolbar">
        {(['pending', 'accepted', 'rejected', 'expired'] as const).map((value) => (
          <button
            key={value}
            className={status === value ? 'is-active' : ''}
            onClick={() => setStatus(value)}
          >
            {
              (
                {
                  pending: '待审查',
                  accepted: '已采纳',
                  rejected: '已拒绝',
                  expired: '已过期',
                } as const
              )[value]
            }
          </button>
        ))}
      </div>
      {error && <p className="graph-candidates-error">{error}</p>}
      {items.length === 0 && !error && <p className="graph-candidates-empty">暂无候选关系</p>}
      {items.map((item) => (
        <article className="graph-candidate" key={item.id}>
          <div className="graph-candidate-relation">
            <strong>{item.relation}</strong>
            <span>{Math.round(item.confidence * 100)}%</span>
          </div>
          <div className="graph-candidate-nodes">
            {item.sourcePage} → {item.targetPage}
          </div>
          <p>{item.evidence}</p>
          {item.status === 'pending' && (
            <div className="graph-candidate-actions">
              <button onClick={() => accept(item.id)}>采纳</button>
              <button onClick={() => reject(item.id)}>拒绝</button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
