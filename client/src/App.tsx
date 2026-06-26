import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

const Settings = lazy(() => import('@/features/settings/components/Settings'));

function getInitialTheme(): string {
  try {
    return localStorage.getItem('mint-theme') || 'mint';
  } catch {
    return 'mint';
  }
}

export default function AppProvider() {
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.remove('theme-mint', 'theme-snow', 'theme-anthropic', 'theme-reddot');
    document.documentElement.classList.add(`theme-${theme}`);
    try {
      localStorage.setItem('mint-theme', theme);
    } catch { /* ignore */ }
  }, [theme]);

  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (showSettings) {
      prevFocusRef.current = document.activeElement as HTMLElement;
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    }
  }, [showSettings]);

  return (
    <div className="app-container">
      <Outlet context={{ onOpenSettings: () => setShowSettings(true) }} />
      {showSettings && (
        <Suspense fallback={null}>
          <Settings
            onClose={() => { setShowSettings(false); }}
            theme={theme}
            onThemeChange={setTheme}
          />
        </Suspense>
      )}
    </div>
  );
}
