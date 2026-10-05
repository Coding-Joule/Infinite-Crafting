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
  set: (p: Partial<Omit<UIState, "set">>) => void;
}

export const useUI = create<UIState>((set) => ({
  recipeItemId: null,
  confirm: null,
  drawerOpen: false,
  menuOpen: false,
  set: (p) => set(p),
}));
