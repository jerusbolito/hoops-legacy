import { describe, expect, it } from 'vitest';
import { trapTarget } from './useDialog';

describe('dialog focus trap', () => {
  it('Tab on the last item wraps to the first, Shift+Tab on the first wraps to the last', () => {
    expect(trapTarget(4, 3, false)).toBe(0);
    expect(trapTarget(4, 0, true)).toBe(3);
  });
  it('leaves Tab alone in the middle', () => {
    expect(trapTarget(4, 1, false)).toBeNull();
    expect(trapTarget(4, 2, true)).toBeNull();
  });
  it('pulls focus that escaped back in, from either direction', () => {
    expect(trapTarget(4, -1, false)).toBe(0);
    expect(trapTarget(4, -1, true)).toBe(3);
  });
  it('a dialog with one control keeps focus on it, and one with none does nothing', () => {
    expect(trapTarget(1, 0, false)).toBe(0);
    expect(trapTarget(1, 0, true)).toBe(0);
    expect(trapTarget(0, -1, false)).toBeNull();
  });
});
