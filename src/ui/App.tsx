import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useEffect } from 'react';
import { useStore } from '../state/store';
import { Toasts } from './components/Toasts';
import { CreateScreen } from './screens/CreateScreen';
import { GameShell } from './screens/GameShell';
import { SetupScreen } from './screens/SetupScreen';
import { TitleScreen } from './screens/TitleScreen';

export function App() {
  const screen = useStore((s) => s.screen);
  const boot = useStore((s) => s.boot);
  useEffect(() => boot(), [boot]);

  return (
    <>
      {screen === 'setup' && <SetupScreen />}
      {screen === 'title' && <TitleScreen />}
      {screen === 'create' && <CreateScreen />}
      {screen === 'game' && <GameShell />}
      <Toasts />
      {/* Vercel page-view analytics and web-vitals. No-ops outside Vercel; never sent any game data or keys. */}
      <Analytics />
      <SpeedInsights />
    </>
  );
}
