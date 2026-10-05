import {
  CATEGORIES,
  SIZES,
  TRAITS,
  WORLD_TYPES,
  type Category,
  type ItemDef,
  type Size,
  type Trait,
  type WorldType,
} from "./types";
import { itemId } from "./recipeKey";

const DEFAULT_EMOJI: Record<WorldType, string> = {
  terrain: "⛰️",
  plant: "🌿",
  tree: "🌳",
  building: "🏠",
  human: "🧍",
  animal: "🐾",
  vehicle: "🚗",
  weather: "☁️",
  celestial: "⭐",
  water: "💧",
  fire: "🔥",
  particle: "✨",
  decoration: "🏺",
  machine: "⚙️",
  food: "🍎",
  object: "📦",
  abstract: "💫",
};

const DEFAULT_COLOR: Record<WorldType, string> = {
  terrain: "#8d7a5f",
  plant: "#5aa850",
  tree: "#3f9a4a",
  building: "#d9a066",
  human: "#4f7bd9",
  animal: "#b88a5a",
  vehicle: "#e0534a",
  weather: "#dfe7f0",
  celestial: "#ffd34d",
  water: "#3f8fd8",
  fire: "#ff7a1a",
  particle: "#d6dde6",
  decoration: "#c9a76b",
  machine: "#8a96a8",
  food: "#e8643c",
  object: "#a98f6d",
  abstract: "#b48cf2",
};

/** Default category and traits by world type, used when the source omits them. */
export const WORLD_TYPE_DEFAULTS: Record<
  WorldType,
  { category: Category; size: Size; traits: Trait[] }
> = {
  terrain: { category: "nature", size: "large", traits: ["heavy"] },
  plant: { category: "nature", size: "small", traits: ["flammable", "edible"] },
  tree: { category: "nature", size: "medium", traits: ["flammable"] },
  building: { category: "structure", size: "medium", traits: ["shelter", "heavy"] },
  human: { category: "people", size: "small", traits: ["living"] },
  animal: { category: "life", size: "small", traits: ["living"] },
  vehicle: { category: "vehicle", size: "medium", traits: ["rideable"] },
  weather: { category: "weather", size: "medium", traits: ["flying"] },
  celestial: { category: "space", size: "medium", traits: [] },
  water: { category: "element", size: "medium", traits: ["wet"] },
  fire: { category: "element", size: "small", traits: ["hot", "light"] },
  particle: { category: "material", size: "small", traits: [] },
  decoration: { category: "structure", size: "small", traits: [] },
  machine: { category: "tech", size: "medium", traits: ["electric"] },
  food: { category: "food", size: "tiny", traits: ["edible"] },
  object: { category: "tool", size: "small", traits: [] },
  abstract: { category: "concept", size: "small", traits: ["flying"] },
};

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Return the first emoji grapheme in a string, or null. */
export function firstEmoji(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text) return null;
  const graphemes = segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);
  for (const g of graphemes) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) return g;
  }
  return null;
}

/** Clean an item name: short, title-cased, no odd characters. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let name = input
    .replace(/[\u0000-\u001f"`<>{}\[\]\\|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  const words = name.split(" ").slice(0, 3);
  name = words
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  if (name.length > 28) name = name.slice(0, 28).trim();
  return name || null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function cleanColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return fallback;
}

function cleanDescription(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) return `A ${name.toLowerCase()}.`;
  let d = value.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  if (d.length > 110) d = d.slice(0, 107).trimEnd() + "…";
  return d;
}

/**
 * Validate and normalize an arbitrary (possibly LLM-produced) item object.
 * Returns null when the object has no usable name.
 */
export function sanitizeItem(raw: unknown): ItemDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  if (!name) return null;
  const worldType = pick(r.worldType, WORLD_TYPES, "object");
  const defaults = WORLD_TYPE_DEFAULTS[worldType];
  const traitsIn = Array.isArray(r.traits) ? r.traits : defaults.traits;
  const traits = Array.from(
    new Set(
      traitsIn
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t): t is Trait => (TRAITS as readonly string[]).includes(t)),
    ),
  ).slice(0, 6);
  return {
    id: itemId(name),
    name,
    emoji: firstEmoji(r.emoji) ?? DEFAULT_EMOJI[worldType],
    category: pick(r.category, CATEGORIES, defaults.category),
    description: cleanDescription(r.description, name),
    worldType,
    size: pick(r.size, SIZES, defaults.size),
    color: cleanColor(r.color, DEFAULT_COLOR[worldType]),
    traits,
  };
}

/** Sanitize a user-supplied input name for the combine endpoint. */
export function sanitizeInputName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const n = input.replace(/[\u0000-\u001f"`<>{}\[\]\\]/g, "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 40) return null;
  return n;
}
