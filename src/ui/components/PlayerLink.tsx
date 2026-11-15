import type { PaperItem } from '../../state/schemas';
import { useStore } from '../../state/store';
import { cx } from './ui';

/** A name that opens that player's card. */
export function PlayerLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const open = useStore((s) => s.openCard);
  return (
    <button type="button" onClick={() => open(id)} className={cx('cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid', className)}>
      {children}
    </button>
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A line of newspaper text where every named player is a link to their card. */
export function PersonText({ item, className }: { item: PaperItem; className?: string }) {
  const people = [...item.people].sort((a, b) => b.name.length - a.name.length);
  if (!people.length) return <span className={className}>{item.text}</span>;
  const re = new RegExp(`(${people.map((p) => escape(p.name)).join('|')})`, 'g');
  const parts = item.text.split(re);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const p = people.find((q) => q.name === part);
        return p ? (
          <PlayerLink key={i} id={p.id}>
            {part}
          </PlayerLink>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}
