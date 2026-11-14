import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What to show instead when something inside crashes. Defaults to the full-page recovery screen. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called once with the error, for example to close the thing that broke. */
  onError?: (error: Error) => void;
  /** When this changes, a crashed section gets another chance. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Without this, a mistake while drawing any one part of the game blanks the whole page with no explanation.
 * It catches the mistake, keeps the rest of the game on screen (or shows a recovery screen), and tells the player what to do.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The game hit a problem while drawing a screen:', error, info.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <RecoveryScreen error={error} onRetry={this.reset} />;
  }
}

/** Plain styling on purpose: if the game's own styles or components are what broke, this still has to work. */
function RecoveryScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#0b0f17', color: '#eef2f8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🏀</div>
        <h1 style={{ fontSize: 22, margin: '8px 0' }}>Something went wrong drawing this screen</h1>
        <p style={{ color: '#b7c0cf', lineHeight: 1.5 }}>Your career is safe. The game saves after everything you do, so you will be right where you left off.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
          <button onClick={onRetry} style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#f97316', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Try again
          </button>
          <button onClick={() => location.reload()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2a3549', background: 'transparent', color: '#eef2f8', fontWeight: 600, cursor: 'pointer' }}>
            Reload the game
          </button>
        </div>
        <details style={{ color: '#8a95a8', fontSize: 12, textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Details for a bug report</summary>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{error.stack ?? error.message}</pre>
        </details>
      </div>
    </div>
  );
}
