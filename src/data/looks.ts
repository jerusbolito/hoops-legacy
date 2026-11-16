/**
 * How the player looks. Portraits are drawn from a name, so anyone without a chosen look gets a face from their name;
 * the player's own chosen look is registered here by name when a career is opened, and the portrait asks for it.
 */

export const SKIN_TONES = ['#f6d7b8', '#eac29a', '#d9a273', '#c18454', '#a2673d', '#7b4a2a', '#5a3420', '#3f2417'];

export const HAIR_COLORS = [
  { c: '#14100e', w: 5 },
  { c: '#2a1a10', w: 4 },
  { c: '#4a2e1b', w: 3 },
  { c: '#7a4a25', w: 2 },
  { c: '#b9803c', w: 1.2 },
  { c: '#d9b36a', w: 0.8 },
  { c: '#9a9a9a', w: 0.4 },
];

export type HairStyle = 'buzz' | 'short' | 'waves' | 'afro' | 'bald' | 'braids' | 'bun' | 'long' | 'ponytail' | 'cap';
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'buzz', label: 'Buzz' },
  { id: 'short', label: 'Short' },
  { id: 'waves', label: 'Waves' },
  { id: 'afro', label: 'Afro' },
  { id: 'braids', label: 'Braids' },
  { id: 'bun', label: 'Bun' },
  { id: 'long', label: 'Long' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'cap', label: 'Cap' },
  { id: 'bald', label: 'Bald' },
];

export interface ChosenLook {
  skin: number;
  hair: number;
  style: string;
  number: number;
}

const chosen = new Map<string, ChosenLook>();

/** Register (or clear) the look to draw for a name. */
export function setLookOverride(name: string, look: ChosenLook | null) {
  if (look) chosen.set(name, look);
  else chosen.delete(name);
}

export const lookOverride = (name: string): ChosenLook | undefined => chosen.get(name);

export const isHairStyle = (s: string): s is HairStyle => HAIR_STYLES.some((h) => h.id === s);
