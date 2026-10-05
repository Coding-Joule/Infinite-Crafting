"use client";

import { create } from "zustand";
import type { WorldEngine } from "../world/engine";
import { combineItems } from "./combine";
import { useGame } from "./store";
import { sfx } from "./sound";

/**
 * Pointer-based drag & drop shared by the inventory, the crafting bench and
 * the world. (HTML5 drag & drop does not work with touch, so we roll our own.)
 */
export interface DragInfo {
  itemId: string;
  source: "inventory" | "bench";
  benchUid?: string;
  x: number;
  y: number;
}

export interface Burst {
  id: number;
  x: number;
  y: number;
  color: string;
}

interface DragState {
  drag: DragInfo | null;
  hoverChip: string | null;
  overBench: boolean;
  overWorld: boolean;
  bursts: Burst[];
  worldDrag: { active: boolean; overTrash: boolean };
  set: (p: Partial<DragState>) => void;
  burst: (x: number, y: number, color: string) => void;
}

let burstSeq = 1;

export const useDrag = create<DragState>((set) => ({
  drag: null,
  hoverChip: null,
  overBench: false,
  overWorld: false,
  bursts: [],
  worldDrag: { active: false, overTrash: false },
  set: (p) => set(p),
  burst: (x, y, color) => {
    const id = burstSeq++;
    set((s) => ({ bursts: [...s.bursts, { id, x, y, color }] }));
    setTimeout(() => set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })), 900);
  },
}));

let engine: WorldEngine | null = null;
export function setEngine(e: WorldEngine | null) {
  engine = e;
}
export function getEngine() {
  return engine;
}

function findTargets(x: number, y: number, selfUid?: string) {
  const els = document.elementsFromPoint(x, y);
  let chip: string | null = null;
  let bench: HTMLElement | null = null;
  for (const el of els) {
    const h = el as HTMLElement;
    if (!chip && h.dataset?.benchChip && h.dataset.benchChip !== selfUid) chip = h.dataset.benchChip;
    if (!bench && h.dataset?.bench !== undefined) bench = h;
    if (h.dataset?.dropBlock !== undefined) break; // panels that sit above the world
  }
  return { chip, bench };
}

/** Combine `itemId` into the bench chip `targetUid` (optionally consuming another chip). */
export async function combineOnBench(itemId: string, targetUid: string, consumeUid?: string) {
  const g = useGame.getState();
  const target = g.bench.find((c) => c.uid === targetUid);
  if (!target) return;
  g.updateBenchChip(targetUid, { pending: true });
  if (consumeUid) g.removeBenchChip(consumeUid);
  sfx("combine");
  const res = await combineItems(itemId, target.itemId);
  const still = useGame.getState().bench.find((c) => c.uid === targetUid);
  if (!res) {
    if (still) useGame.getState().updateBenchChip(targetUid, { pending: false });
    return;
  }
  if (still) useGame.getState().updateBenchChip(targetUid, { itemId: res.item.id, pending: false });
  const el = document.querySelector<HTMLElement>(`[data-bench-chip="${targetUid}"]`);
  if (el) {
    const r = el.getBoundingClientRect();
    useDrag.getState().burst(r.left + r.width / 2, r.top + r.height / 2, res.item.color);
  }
}

/**
 * Begin a potential drag from a chip. Mouse/pen start immediately on movement;
 * touch in a scrollable list needs a short press first so scrolling still works.
 */
export function beginChipDrag(
  e: React.PointerEvent,
  info: { itemId: string; source: "inventory" | "bench"; benchUid?: string },
  onTap?: () => void,
  onStart?: () => void,
) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  const startX = e.clientX;
  const startY = e.clientY;
  const pointerId = e.pointerId;
  const needsHold = e.pointerType === "touch" && info.source === "inventory";
  let holdReady = !needsHold;
  let dragging = false;
  let cancelled = false;
  let lastX = startX;
  let lastY = startY;
  const holdTimer = needsHold
    ? setTimeout(() => {
        holdReady = true;
        if (Math.hypot(lastX - startX, lastY - startY) < 10) startDrag(lastX, lastY);
      }, 170)
    : null;

  const preventScroll = (ev: TouchEvent) => {
    if (dragging) ev.preventDefault();
  };

  function startDrag(x: number, y: number) {
    if (dragging || cancelled) return;
    dragging = true;
    onStart?.();
    sfx("pick");
    if (navigator.vibrate) navigator.vibrate(8);
    useDrag.getState().set({ drag: { ...info, x, y } });
    move(x, y);
  }

  function move(x: number, y: number) {
    const st = useDrag.getState();
    const { chip, bench } = findTargets(x, y, info.benchUid);
    const overWorld = !chip && !bench && !!engine?.externalDragMove(x, y, info.itemId);
    if (chip || bench) engine?.externalDragEnd();
    st.set({ drag: { ...info, x, y }, hoverChip: chip, overBench: !!bench, overWorld });
  }

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!dragging) {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!holdReady) {
        if (dist > 10) cleanup(); // the user is scrolling the list
        return;
      }
      if (dist > 5) startDrag(ev.clientX, ev.clientY);
      return;
    }
    ev.preventDefault();
    move(ev.clientX, ev.clientY);
  }

  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    const wasDragging = dragging;
    cleanup();
    if (!wasDragging) {
      if (ev.type === "pointerup") onTap?.();
      return;
    }
    if (ev.type === "pointercancel") return;
    drop(ev.clientX, ev.clientY);
  }

  function drop(x: number, y: number) {
    const g = useGame.getState();
    const { chip, bench } = findTargets(x, y, info.benchUid);
    if (chip) {
      void combineOnBench(info.itemId, chip, info.source === "bench" ? info.benchUid : undefined);
      return;
    }
    if (!bench && engine?.externalDrop(x, y, info.itemId)) {
      if (info.source === "bench" && info.benchUid) g.removeBenchChip(info.benchUid);
      return;
    }
    if (bench) {
      const r = bench.getBoundingClientRect();
      const fx = Math.max(0.04, Math.min(0.96, (x - r.left) / r.width));
      const fy = Math.max(0.12, Math.min(0.88, (y - r.top) / r.height));
      if (info.source === "bench" && info.benchUid) g.updateBenchChip(info.benchUid, { x: fx, y: fy });
      else g.addBenchChip(info.itemId, fx, fy);
      sfx("drop");
      return;
    }
    // Dropped somewhere else (e.g. back on the inventory): remove from bench.
    if (info.source === "bench" && info.benchUid) {
      g.removeBenchChip(info.benchUid);
      sfx("delete");
    }
  }

  function cleanup() {
    cancelled = true;
    if (holdTimer) clearTimeout(holdTimer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("touchmove", preventScroll);
    if (dragging) {
      engine?.externalDragEnd();
      useDrag.getState().set({ drag: null, hoverChip: null, overBench: false, overWorld: false });
    }
    dragging = false;
  }

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("touchmove", preventScroll, { passive: false });
}
