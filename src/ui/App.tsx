import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useEffect } from 'react';
import { getDesktop } from '../desktop/bridge';
import { useStore } from '../state/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { CreateScreen } from './screens/CreateScreen';
import { DesktopSetup } from './screens/DesktopSetup';
import { GameShell } from './screens/GameShell';
import { SetupScreen } from './screens/SetupScreen';
import { TitleScreen } from './screens/TitleScreen';

export function App() {
  const screen = useStore((s) => s.screen);
  const boot = useStore((s) => s.boot);
  const isDesktop = !!getDesktop();
  useEffect(() => boot(), [boot]);

  return (
    <>
      {/* If a screen crashes, show a recovery screen instead of a blank page. Moving to another screen gives it a fresh start. */}
      <ErrorBoundary resetKey={screen}>
        {screen === 'setup' && <SetupScreen />}
        {screen === 'desktop' && <DesktopSetup />}
        {screen === 'title' && <TitleScreen />}
        {screen === 'create' && <CreateScreen />}
        {screen === 'game' && <GameShell />}
      </ErrorBoundary>
      <ErrorBoundary fallback={() => null}>
        <Toasts />
      </ErrorBoundary>
      {/* Vercel page-view analytics and web-vitals, website only. No-ops outside Vercel; never sent any game data or keys. The desktop app sends nothing. */}
      {!isDesktop && <Analytics />}
      {!isDesktop && <SpeedInsights />}
    </>
  );
}
