import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Toaster } from './components/Toaster';
import { PasswordPrompt } from './components/PasswordPrompt';
import { ThemeSync } from './hooks/useSettings';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
    <Toaster />
    <PasswordPrompt />
    <ThemeSync />
  </StrictMode>,
);
