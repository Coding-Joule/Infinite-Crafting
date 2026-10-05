// localStorage persistence. Every access is guarded: storage can be missing,
// full, or blocked (private mode), and the game must still run.

const PREFIX = "iwc:v1:";

export const KEYS = {
  discoveries: "discoveries",
  recipes: "recipes",
  favorites: "favorites",
  settings: "settings",
  bench: "bench",
  world: "world",
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: progress just won't persist this session.
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
