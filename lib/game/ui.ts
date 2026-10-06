"use client";

import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface UIState {
  recipeItemId: string | null;
  confirm: ConfirmRequest | null;
  drawerOpen: boolean;
  menuOpen: boolean;
  news: NewsItem[];
  set: (p: Partial<Omit<UIState, "set" | "pushNews">>) => void;
  pushNews: (text: string) => void;
}

export interface NewsItem {
  id: number;
  text: string;
  at: number;
}

let newsSeq = 1;

export const useUI = create<UIState>((set) => ({
  recipeItemId: null,
  confirm: null,
  drawerOpen: false,
  menuOpen: false,
  news: [],
  set: (p) => set(p),
  pushNews: (text) => set((s) => ({ news: [...s.news, { id: newsSeq++, text, at: Date.now() }].slice(-5) })),
}));
