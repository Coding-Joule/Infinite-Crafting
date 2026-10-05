import type { ItemDef, Size, WorldType } from "../types";
import { WORLD, type Layer } from "./types";

/**
 * An archetype is how the engine treats an item in the world: which layer it
 * lives on, how big it is, and which behaviors drive it. It is derived purely
 * from worldType + size + traits, so any generated item gets sensible behavior.
 */
export type Movement = "static" | "wander" | "fly" | "drive" | "rails" | "sail" | "drift" | "float";

export interface Archetype {
  layer: Layer;
  /** "foot": (x,y) is the bottom-center. "center": (x,y) is the middle. */
  anchor: "foot" | "center";
  w: number;
  h: number;
  movement: Movement;
  speed: number;
  /** objects with depth scale get larger as they come closer (lower on screen) */
  depth: boolean;
}

export const SIZE_PX: Record<Size, number> = {
  tiny: 32,
  small: 54,
  medium: 80,
  large: 150,
  huge: 290,
};

const SPEED: Record<Size, number> = { tiny: 28, small: 36, medium: 52, large: 46, huge: 36 };

const cache = new Map<string, Archetype>();

export function archetypeFor(item: ItemDef): Archetype {
  const key = item.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = compute(item);
  cache.set(key, a);
  return a;
}

function compute(item: ItemDef): Archetype {
  const s = SIZE_PX[item.size];
  const t = (x: string) => item.traits.includes(x as never);
  const flying = t("flying");
  const base: Archetype = {
    layer: "ground",
    anchor: "foot",
    w: s,
    h: s,
    movement: "static",
    speed: 0,
    depth: true,
  };

  const wt: WorldType = item.worldType;
  switch (wt) {
    case "terrain": {
      if (item.size === "large" || item.size === "huge") {
        const h = s * 1.45;
        return { ...base, layer: "background", w: h * (item.size === "huge" ? 2.1 : 1.9), h, depth: false };
      }
      return { ...base, w: s * 1.5, h: s * 0.75 };
    }
    case "water": {
      const w = s * 3.4;
      return { ...base, layer: "flat", anchor: "center", w, h: Math.max(40, w * 0.2) };
    }
    case "tree": {
      const h = s * 1.6;
      return { ...base, w: h * (item.size === "large" || item.size === "huge" ? 1.6 : 0.7), h };
    }
    case "plant":
      return { ...base, w: s * 0.9, h: s * 0.95 };
    case "building": {
      const h = s * 1.35;
      const wide = item.size === "huge" ? 1.7 : item.size === "large" ? 0.75 : 1.05;
      return { ...base, w: h * wide, h };
    }
    case "human": {
      const h = s * 1.05;
      if (flying) return { ...base, layer: "air", anchor: "center", w: h * 0.6, h, movement: "fly", speed: SPEED[item.size] };
      return { ...base, w: h * 0.55, h, movement: "wander", speed: SPEED[item.size] };
    }
    case "animal": {
      const h = s * 0.9;
      if (flying)
        return { ...base, layer: "air", anchor: "center", w: h, h, movement: "fly", speed: SPEED[item.size] * 1.8 };
      return {
        ...base,
        w: h * 1.05,
        h,
        movement: t("heavy") && !t("living") ? "static" : "wander",
        speed: SPEED[item.size],
      };
    }
    case "vehicle": {
      const h = s * 0.8;
      const w = h * 1.4;
      if (flying) return { ...base, layer: "air", anchor: "center", w, h, movement: "fly", speed: 120 };
      if (t("rails")) return { ...base, w: w * 1.2, h, movement: "rails", speed: 130 };
      if (t("swimming")) return { ...base, w, h, movement: "sail", speed: 40 };
      return { ...base, w, h, movement: "drive", speed: 90 };
    }
    case "weather": {
      const w = s * 2.3;
      return { ...base, layer: "weather", anchor: "center", w, h: w * 0.45, movement: "drift", speed: 10, depth: false };
    }
    case "celestial": {
      const d = Math.min(220, s * 0.9);
      return { ...base, layer: "sky", anchor: "center", w: d, h: d, depth: false };
    }
    case "fire":
      if (t("heavy")) return { ...base, w: s * 1.6, h: s * 0.7 };
      return { ...base, w: s * 0.8, h: s };
    case "particle":
      return { ...base, w: s * 1.1, h: s * 1.3 };
    case "abstract":
      return { ...base, w: s * 0.85, h: s * 0.85, movement: "float" };
    case "decoration":
      if (t("rail")) return { ...base, layer: "flat", anchor: "center", w: s * 3.2, h: 26 };
      return { ...base, w: s * 0.9, h: s * 0.9 };
    case "machine":
      return { ...base, w: s * 0.9, h: s * 0.9 };
    case "food":
    case "object":
    default:
      if (flying) return { ...base, layer: "air", anchor: "center", w: s * 0.9, h: s * 0.9, movement: "float" };
      return { ...base, w: s * 0.85, h: s * 0.85 };
  }
}

/** Allowed y range for an anchor on a given layer. */
export function layerBand(layer: Layer): [number, number] {
  const H = WORLD.HORIZON;
  switch (layer) {
    case "sky":
      return [110, H - 420];
    case "weather":
      return [200, H - 300];
    case "air":
      return [260, H - 60];
    case "background":
      return [H + 4, H + 70];
    case "flat":
      return [H + 60, WORLD.H - 60];
    case "ground":
    default:
      return [H + 24, WORLD.H - 20];
  }
}

export function clampToLayer(layer: Layer, x: number, y: number): [number, number] {
  const [y0, y1] = layerBand(layer);
  return [Math.max(40, Math.min(WORLD.W - 40, x)), Math.max(y0, Math.min(y1, y))];
}

/** 0..1 depth for ground objects (0 = horizon, 1 = front). */
export function depthOf(y: number): number {
  return Math.max(0, Math.min(1, (y - WORLD.HORIZON) / (WORLD.H - WORLD.HORIZON)));
}

export function depthScale(arch: Archetype, y: number): number {
  if (!arch.depth) return 1;
  if (arch.layer === "air") return 0.9;
  return 0.72 + 0.48 * depthOf(y);
}

/** World-space bounding box of an object. */
export function boundsOf(arch: Archetype, x: number, y: number): { x: number; y: number; w: number; h: number; scale: number } {
  const scale = depthScale(arch, y);
  const w = arch.w * scale;
  const h = arch.h * scale;
  if (arch.anchor === "foot") return { x: x - w / 2, y: y - h, w, h, scale };
  return { x: x - w / 2, y: y - h / 2, w, h, scale };
}

/** Draw-order rank per layer (lower first). */
export const LAYER_ORDER: Record<Layer, number> = {
  sky: 0,
  background: 1,
  flat: 2,
  ground: 3,
  air: 4,
  weather: 5,
};
