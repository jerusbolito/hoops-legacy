import { Fragment } from 'react';
import { CHANGELOG } from '../../changelog';
import { Button } from './ui';

/** `**bold**` and `code` in a changelog line, nothing else. */
function Line({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
        p.startsWith('**') ? <strong key={i} className="font-semibold text-ink-100">{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i} className="rounded bg-court-800 px-1 text-xs">{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/** The release notes, newest first, read from CHANGELOG.md. */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="What's new" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-court-700 bg-court-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">What's new</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {CHANGELOG.map((e) => (
          <section key={e.version} className="mb-5">
            <h3 className="font-display text-lg font-semibold text-hoop-400">Version {e.version}</h3>
            {e.sections.map((s, i) => (
              <div key={i} className="mt-2">
                {s.title && <h4 className="text-sm font-semibold text-ink-200">{s.title}</h4>}
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-300">
                  {s.items.map((it, j) => (
                    <li key={j}><Line text={it} /></li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
