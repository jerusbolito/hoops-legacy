import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab should go next inside a dialog. Returns the index to focus, or null to let the browser do its normal thing.
 * Tab on the last item wraps to the first, Shift+Tab on the first wraps to the last, and focus that has escaped the
 * dialog (activeIndex -1) is pulled back in.
 */
export function trapTarget(count: number, activeIndex: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (activeIndex < 0) return shift ? count - 1 : 0;
  if (shift && activeIndex === 0) return count - 1;
  if (!shift && activeIndex === count - 1) return 0;
  return null;
}

/**
 * Keyboard behaviour for a dialog that can be dismissed: Escape closes it, Tab stays inside it, focus moves in when
 * it opens and goes back to whatever had it when it closes. Attach the returned ref to the dialog's container.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const el = ref.current;
    if (el) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const to = trapTarget(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (to !== null) {
        e.preventDefault();
        items[to].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}
