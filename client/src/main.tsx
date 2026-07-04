import ReactDOM from 'react-dom/client';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/index.css';

function BootSplashRemover() {
  useEffect(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;

    splash.classList.add('is-fading');
    const timer = window.setTimeout(() => {
      splash.remove();
    }, 200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <BootSplashRemover />
    <RouterProvider router={router} />
  </>
);
