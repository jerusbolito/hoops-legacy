import { describe, expect, it } from 'vitest';
import { createCareer } from '../engine/career';
import { SaveTooNewError, migrateSave, parseSave, safeParseSave } from './migrate';
import { SAVE_VERSION } from './schemas';

const make = () => createCareer({ firstName: 'Mi', lastName: 'Grate', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 5 });

describe('save migrations', () => {
  it('a current save passes through untouched', () => {
    const s = make();
    expect(parseSave(JSON.parse(JSON.stringify(s))).id).toBe(s.id);
  });

  it('runs each step in order and stamps the new version', () => {
    const steps = {
      1: (r: Record<string, unknown>) => ({ ...r, oldName: r.name, trail: ['1'] }),
      2: (r: Record<string, unknown>) => ({ ...r, trail: [...(r.trail as string[]), '2'] }),
    };
    const out = migrateSave({ version: 1, name: 'x' }, 3, steps) as Record<string, unknown>;
    expect(out.version).toBe(3);
    expect(out.trail).toEqual(['1', '2']);
  });

  it('a save from the future is refused with a clear error, not silently mangled', () => {
    expect(() => migrateSave({ version: SAVE_VERSION + 1 })).toThrow(SaveTooNewError);
    expect(safeParseSave({ version: SAVE_VERSION + 1 }).success).toBe(false);
  });

  it('a missing migration is an error', () => {
    expect(() => migrateSave({ version: 1 }, 2, {})).toThrow(/No migration/);
  });

  it('garbage does not throw in safeParse', () => {
    expect(safeParseSave(null).success).toBe(false);
    expect(safeParseSave({ nope: 1 }).success).toBe(false);
  });
});
