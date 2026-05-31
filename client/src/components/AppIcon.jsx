import iconUrl from '../styles/icon.svg';

export default function AppIcon({ size = 36, className = '' }) {
  return (
    <div
      className={`app-icon ${className}`.trim()}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <img src={iconUrl} alt="Mint" style={{ width: size, height: size, display: 'block' }} />
    </div>
  );
}
