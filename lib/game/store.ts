"use client";

import { create } from "zustand";
import type { Discovery, ItemDef } from "../types";
import { catalogItem, STARTER_NAMES } from "../fallback/catalog";
import { KEYS, loadJSON, saveJSON } from "./persistence";

export interface BenchChip {
  uid: string;
  itemId: string;
  x: number; // fraction 0..1 of bench width
  y: number; // fraction 0..1 of bench height
  pending?: boolean;
}

export interface Settings {
  muted: boolean;
  dayCycle: boolean;
}

export interface Toast {
  id: number;
  item: Discovery;
}

interface GameState {
  hydrated: boolean;
  discoveries: Record<string, Discovery>;
  recipes: Record<string, string>; // recipeKey -> result item id
  favorites: Record<string, true>;
  settings: Settings;
  bench: BenchChip[];
  toasts: Toast[];
  selectedObjectId: string | null;
  worldCount: number;
  aiEnabled: boolean | null;

  hydrate: () => void;
  discover: (item: ItemDef, from: [string, string] | null) => { discovery: Discovery; isNew: boolean };
  recordRecipe: (key: string, resultId: string) => void;
  toggleFavorite: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  addBenchChip: (itemId: string, x?: number, y?: number) => string;
  updateBenchChip: (uid: string, patch: Partial<BenchChip>) => void;
  removeBenchChip: (uid: string) => void;
  clearBench: () => void;
  dismissToast: (id: number) => void;
  setSelectedObject: (id: string | null) => void;
  setWorldCount: (n: number) => void;
  setAiEnabled: (v: boolean) => void;
  resetProgress: () => void;
}

function starters(): Record<string, Discovery> {
  const out: Record<string, Discovery> = {};
  STARTER_NAMES.forEach((name, i) => {
    const item = catalogItem(name)!;
    out[item.id] = { ...item, discoveredAt: i, from: null, starter: true };
  });
  return out;
}

let toastSeq = 1;

export const useGame = create<GameState>((set, get) => ({
  hydrated: false,
  discoveries: starters(),
  recipes: {},
  favorites: {},
  settings: { muted: false, dayCycle: true },
  bench: [],
  toasts: [],
  selectedObjectId: null,
  worldCount: 0,
  aiEnabled: null,

  hydrate: () => {
    if (get().hydrated) return;
    const saved = loadJSON<Record<string, Discovery>>(KEYS.discoveries, {});
    set({
      hydrated: true,
      discoveries: { ...starters(), ...saved },
      recipes: loadJSON(KEYS.recipes, {}),
      favorites: loadJSON(KEYS.favorites, {}),
      settings: { muted: false, dayCycle: true, ...loadJSON<Partial<Settings>>(KEYS.settings, {}) },
      bench: loadJSON<BenchChip[]>(KEYS.bench, []).map((c) => ({ ...c, pending: false })),
    });
  },

  discover: (item, from) => {
    const existing = get().discoveries[item.id];
    if (existing) return { discovery: existing, isNew: false };
    const discovery: Discovery = { ...item, discoveredAt: Date.now(), from };
    set((s) => ({
      discoveries: { ...s.discoveries, [item.id]: discovery },
      toasts: [...s.toasts, { id: toastSeq++, item: discovery }].slice(-3),
    }));
    return { discovery, isNew: true };
  },

  recordRecipe: (key, resultId) => set((s) => ({ recipes: { ...s.recipes, [key]: resultId } })),

  toggleFavorite: (id) =>
    set((s) => {
      const favorites = { ...s.favorites };
      if (favorites[id]) delete favorites[id];
      else favorites[id] = true;
      return { favorites };
    }),

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  addBenchChip: (itemId, x, y) => {
    const uid = Math.random().toString(36).slice(2, 10);
    const chip: BenchChip = {
      uid,
      itemId,
      x: x ?? 0.15 + Math.random() * 0.7,
      y: y ?? 0.25 + Math.random() * 0.5,
    };
    set((s) => ({ bench: [...s.bench, chip].slice(-40) }));
    return uid;
  },
  updateBenchChip: (uid, patch) => set((s) => ({ bench: s.bench.map((c) => (c.uid === uid ? { ...c, ...patch } : c)) })),
  removeBenchChip: (uid) => set((s) => ({ bench: s.bench.filter((c) => c.uid !== uid) })),
  clearBench: () => set({ bench: [] }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  setWorldCount: (n) => set({ worldCount: n }),
  setAiEnabled: (v) => set({ aiEnabled: v }),

  resetProgress: () =>
    set({
      discoveries: starters(),
      recipes: {},
      favorites: {},
      bench: [],
      toasts: [],
      selectedObjectId: null,
    }),
}));

// Persist slices whenever they change (after hydration).
let timer: ReturnType<typeof setTimeout> | null = null;
useGame.subscribe((s) => {
  if (!s.hydrated) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const st = useGame.getState();
    saveJSON(KEYS.discoveries, st.discoveries);
    saveJSON(KEYS.recipes, st.recipes);
    saveJSON(KEYS.favorites, st.favorites);
    saveJSON(KEYS.settings, st.settings);
    saveJSON(KEYS.bench, st.bench.map(({ pending: _p, ...c }) => c));
  }, 300);
});

export function getItem(id: string): Discovery | undefined {
  return useGame.getState().discoveries[id];
}
