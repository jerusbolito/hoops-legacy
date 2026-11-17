import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the game (nothing is loaded from Google), so it looks the same offline and in the desktop app.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './index.css';
import { useStore } from './state/store';
import { startAccount } from './sync/account';
import { App } from './ui/App';

// Debugging handle: window.__hoops.getState() / .setState(). Present in dev, and in production only when built with VITE_EXPOSE_STORE=1.
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_STORE) (window as unknown as { __hoops: typeof useStore }).__hoops = useStore;

// restores a signed-in session and starts background sync (does nothing in a build without Supabase settings)
startAccount();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
