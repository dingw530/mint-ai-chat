import { createHashRouter, createBrowserRouter, Navigate } from 'react-router-dom';
import AppProvider from './App';
import ChatPage from './features/chat/ChatPage';
import ImagePage from './features/images/ImagePage';
import WikiPage from './features/wiki/WikiPage';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

const routes = [
  {
    element: <AppProvider />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/image', element: <ImagePage /> },
      { path: '/wiki', element: <WikiPage /> },
    ],
  },
];

export const router = isElectron
  ? createHashRouter(routes)
  : createBrowserRouter(routes);
