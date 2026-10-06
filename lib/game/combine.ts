"use client";

import type { CombineResponse, Discovery, ItemDef } from "../types";
import { recipeKey } from "../recipeKey";
import { sanitizeItem } from "../sanitize";
import { generateFallback } from "../fallback/generateFallback";
import { useGame } from "./store";
import { sfx } from "./sound";

export interface CombineResult {
  item: Discovery;
  isNew: boolean;
}

const inflight = new Map<string, Promise<ItemDef>>();

const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

async function fetchCombination(a: Discovery, b: Discovery): Promise<ItemDef> {
  // Static hosting (GitHub Pages) has no server: combine locally.
  if (STATIC_EXPORT) return generateFallback(a, b);
  try {
    const res = await fetch("/api/combine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: { name: a.name, emoji: a.emoji }, b: { name: b.name, emoji: b.emoji } }),
    });
    if (res.ok) {
      const data = (await res.json()) as CombineResponse;
      const item = sanitizeItem(data.item);
      if (item) return item;
    }
  } catch {
    // offline / static hosting: use the local engine below
  }
  return generateFallback(a, b);
}

/**
 * Combine two discovered items. Uses the local recipe cache first, then the
 * server (which has its own cache + LLM), and records the result as a discovery.
 */
export async function combineItems(aId: string, bId: string): Promise<CombineResult | null> {
  const state = useGame.getState();
  const a = state.discoveries[aId];
  const b = state.discoveries[bId];
  if (!a || !b) return null;
  const key = recipeKey(a.name, b.name);

  const cachedId = state.recipes[key];
  if (cachedId && state.discoveries[cachedId]) {
    sfx("combine");
    return { item: state.discoveries[cachedId], isNew: false };
  }

  let job = inflight.get(key);
  if (!job) {
    job = fetchCombination(a, b).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  const item = await job;
  const { discovery, isNew } = useGame.getState().discover(item, [a.id, b.id]);
  useGame.getState().recordRecipe(key, discovery.id);
  sfx(isNew ? "discover" : "combine");
  return { item: discovery, isNew };
}
