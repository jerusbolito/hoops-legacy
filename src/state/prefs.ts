import { create } from 'zustand';

/** Display and sound preferences. Kept in localStorage, separate from the career save. */
interface Prefs {
  sound: boolean;
  haptics: boolean;
  /** Big celebratory effects: banners, callouts and shaking. Turn off for a calmer screen. */
  flashy: boolean;
  set(patch: Partial<Pick<Prefs, 'sound' | 'haptics' | 'flashy'>>): void;
}

const KEY = 'hoops-legacy-prefs';

function load(): Pick<Prefs, 'sound' | 'haptics' | 'flashy'> {
  const defaults = { sound: true, haptics: true, flashy: true };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    try {
      const { sound, haptics, flashy } = get();
      localStorage.setItem(KEY, JSON.stringify({ sound, haptics, flashy }));
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
  },
}));
