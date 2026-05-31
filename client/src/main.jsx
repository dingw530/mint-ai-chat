import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Electron macOS 检测
if (window.electronAPI?.isElectron && window.electronAPI?.platform === 'darwin') {
  document.documentElement.classList.add('is-macos');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
