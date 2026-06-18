import type { Agent } from '@/types';

function AgentIcon({ id }: { id: string }) {
  const icons: Record<string, React.ReactNode> = {
    general: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
        <circle cx="12" cy="11" r="1.5" />
      </svg>
    ),
    weather: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 6a1 1 0 001-1V3a1 1 0 00-2 0v2a1 1 0 001 1zm0 12a1 1 0 00-1 1v2a1 1 0 002 0v-2a1 1 0 00-1-1zm8-7h-2a1 1 0 000 2h2a1 1 0 000-2zM6 12a1 1 0 00-1-1H3a1 1 0 000 2h2a1 1 0 001-1zm12.07-6.07a1 1 0 00-1.41 0l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06a1 1 0 000-1.41zM7.4 16.6a1 1 0 00-1.41 0l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06a1 1 0 000-1.41zm11.32 1.06l-1.06-1.06a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41zM7.4 7.4a1 1 0 001.41 0 1 1 0 000-1.41L7.75 4.93a1 1 0 00-1.41 1.41L7.4 7.4zm5.6 2.6a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
  };
  const svg = icons[id] || (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l1.5 6.5L20 9l-5 4.5 1.5 6.5L12 16l-6.5 4L8 13.5 3 9l6.5-.5L12 2z" />
    </svg>
  );
  return <span className="agent-icon">{svg}</span>;
}

interface AgentBarProps {
  agents: Agent[];
  activeAgent: string;
  autoRoutedAgent: string | null;
  lockedAgent: string | null;
  routingMode: string;
  onSelectAgent: (agentId: string) => void;
  onUnlock: () => void;
}

export default function AgentBar({
  agents,
  activeAgent,
  autoRoutedAgent,
  lockedAgent,
  routingMode,
  onSelectAgent,
  onUnlock,
}: AgentBarProps) {
  return (
    <div className="agent-selector">
      <div className="agent-bar">
        {agents.filter(a => a.available !== false).map((agent) => {
          const isDisabled = agent.available === false;
          const label = agent.label || agent.name || agent.id;
          const titleText = isDisabled
            ? (agent.errorMessage || `Agent "${label}" is not available`)
            : (agent.description || label);
          const isLocked = !!lockedAgent;
          const isLockedAgent = lockedAgent === agent.id;
          const isAutoRouted = autoRoutedAgent === agent.id && !isLocked;

          let btnClass = 'agent-btn';
          if (isDisabled) {
            btnClass += ' disabled';
          } else if (isLocked && isLockedAgent) {
            btnClass += ' locked';
          } else if (isLocked) {
            btnClass += ' disabled';
          } else if (isAutoRouted) {
            btnClass += ' auto-routed';
          } else if (activeAgent === agent.id && routingMode === 'manual') {
            btnClass += ' active';
          }

          return (
            <button
              key={agent.id}
              className={btnClass}
              disabled={isDisabled || (isLocked && !isLockedAgent)}
              onClick={() => onSelectAgent(agent.id)}
              title={titleText}
            >
              <AgentIcon id={agent.id} />
              {label}
              {isLockedAgent && (
                <span className="lock-icon">
                  <svg viewBox="0 0 24 24" width="12" height="12" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
                    <path d="M8 11V7a4 4 0 018 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
              )}
              {isAutoRouted && <span className="auto-badge">自动</span>}
              {isLocked && isLockedAgent && (
                <span className="unlock-btn" onClick={(e) => { e.stopPropagation(); onUnlock(); }}>
                  解锁
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
