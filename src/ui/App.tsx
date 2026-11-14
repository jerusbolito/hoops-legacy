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
    </>
  );
}
