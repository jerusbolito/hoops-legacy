import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useStore } from './state/store';
import { App } from './ui/App';

// Debugging handle: window.__hoops.getState() / .setState(). Present in dev, and in production only when built with VITE_EXPOSE_STORE=1.
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_STORE) (window as unknown as { __hoops: typeof useStore }).__hoops = useStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
