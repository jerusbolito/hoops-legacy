import { SLOW_REPLY_SECONDS, getDesktop, lighterModel, modelInfo, repliesAreSlow } from '../../desktop/bridge';
import { useStore } from '../../state/store';
import { Button } from './ui';

/**
 * Desktop only. If the last few story replies were all slow, the model is too big for this computer, and the fix is a
 * click away: offer the next size down. It never nags: one dismissal lasts until the model changes.
 */
export function SlowModelBanner() {
  const llm = useStore((s) => s.llm);
  const seconds = useStore((s) => s.replySeconds);
  const dismissed = useStore((s) => s.slowDismissed);
  const dismiss = useStore((s) => s.dismissSlow);
  const open = useStore((s) => s.openModelManager);
  if (!getDesktop() || dismissed || llm?.presetId !== 'bundled' || !repliesAreSlow(seconds)) return null;
  const current = modelInfo(llm.model);
  const lighter = lighterModel(llm.model);
  if (!current || !lighter) return null;
  const typical = Math.round([...seconds.slice(-3)].sort((a, b) => a - b)[1]);
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
      <span className="flex-1">
        Stories are taking about {typical} seconds each (over {SLOW_REPLY_SECONDS} is slow). {current.label} may be too big for this computer. {lighter.label} is quicker, with simpler writing.
      </span>
      <Button variant="outline" onClick={() => open(lighter.id)}>
        Switch to {lighter.label}
      </Button>
      <Button variant="ghost" onClick={dismiss}>
        Not now
      </Button>
    </div>
  );
}
