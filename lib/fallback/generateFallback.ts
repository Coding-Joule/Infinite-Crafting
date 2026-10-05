import type { ItemDef, Size, Trait, WorldType } from "../types";
import { SIZES } from "../types";
import { itemId } from "../recipeKey";
import { sanitizeItem } from "../sanitize";
import { CATALOG, catalogItem } from "./catalog";
import { RECIPES } from "./recipes";
import { recipeKey } from "../recipeKey";

/**
 * Offline combination engine. Deterministic and commutative:
 * the same pair always produces the same result regardless of order.
 *
 * 1. Hand-written recipe table.
 * 2. Modifier words (Fire → "Blazing", Water → "Sea", ...) applied to the other item.
 * 3. People + thing → profession ("Car" + "Human" → "Car Driver").
 * 4. Otherwise a portmanteau blend that inherits the "head" item's world type.
 */

type Lite = Pick<ItemDef, "name" | "emoji" | "worldType" | "size" | "color" | "traits" | "category"> &
  Partial<Pick<ItemDef, "description">>;

const MODIFIERS: Record<string, { word: string; traits?: Trait[] }> = {
  fire: { word: "Blazing", traits: ["hot", "light"] },
  lava: { word: "Lava", traits: ["hot", "light"] },
  water: { word: "Sea", traits: ["swimming"] },
  sea: { word: "Sea", traits: ["swimming"] },
  ocean: { word: "Deep Sea", traits: ["swimming"] },
  air: { word: "Sky", traits: ["flying"] },
  wind: { word: "Windy", traits: ["flying"] },
  sky: { word: "Sky", traits: ["flying"] },
  earth: { word: "Stone", traits: ["heavy"] },
  stone: { word: "Stone", traits: ["heavy"] },
  mud: { word: "Muddy" },
  sand: { word: "Sand" },
  ice: { word: "Frozen", traits: ["cold"] },
  snow: { word: "Snowy", traits: ["cold"] },
  energy: { word: "Charged", traits: ["electric"] },
  electricity: { word: "Electric", traits: ["electric"] },
  lightning: { word: "Thunder", traits: ["electric"] },
  time: { word: "Ancient" },
  magic: { word: "Magic", traits: ["light"] },
  wizard: { word: "Enchanted", traits: ["light"] },
  metal: { word: "Iron", traits: ["heavy"] },
  iron: { word: "Iron", traits: ["heavy"] },
  gold: { word: "Golden", traits: ["light"] },
  diamond: { word: "Diamond", traits: ["light"] },
  robot: { word: "Robo", traits: ["electric"] },
  computer: { word: "Cyber", traits: ["electric"] },
  night: { word: "Shadow", traits: ["night"] },
  moon: { word: "Moon", traits: ["night"] },
  sun: { word: "Sun", traits: ["light"] },
  space: { word: "Space", traits: ["flying"] },
  life: { word: "Living", traits: ["living"] },
  love: { word: "Lovely" },
  ghost: { word: "Ghost", traits: ["night"] },
  steam: { word: "Steam", traits: ["hot"] },
  cloud: { word: "Cloud", traits: ["flying"] },
  plant: { word: "Leafy" },
  tree: { word: "Wooden", traits: ["flammable"] },
  wood: { word: "Wooden", traits: ["flammable"] },
  dragon: { word: "Dragon", traits: ["hot"] },
  music: { word: "Singing" },
  cheese: { word: "Cheesy", traits: ["edible"] },
  chocolate: { word: "Chocolate", traits: ["edible"] },
  dinosaur: { word: "Dino" },
  king: { word: "Royal" },
  zombie: { word: "Zombie", traits: ["night"] },
  rainbow: { word: "Rainbow", traits: ["light"] },
  baby: { word: "Baby" },
  explosion: { word: "Exploding", traits: ["hot"] },
  pressure: { word: "Compressed", traits: ["heavy"] },
  smoke: { word: "Smoky" },
  dust: { word: "Dusty" },
};

const TRAIT_MODIFIERS: Array<[Trait, string]> = [
  ["hot", "Hot"],
  ["cold", "Frozen"],
  ["electric", "Electric"],
  ["light", "Glowing"],
  ["night", "Shadow"],
  ["wet", "Soggy"],
  ["flying", "Flying"],
];

const PROFESSIONS: Partial<Record<WorldType, string>> = {
  animal: "Tamer",
  plant: "Gardener",
  tree: "Ranger",
  building: "Builder",
  vehicle: "Driver",
  food: "Chef",
  machine: "Engineer",
  celestial: "Astronomer",
  weather: "Forecaster",
  fire: "Firefighter",
  water: "Sailor",
  terrain: "Explorer",
  object: "Maker",
  decoration: "Artist",
  particle: "Alchemist",
  abstract: "Philosopher",
};

/** Higher rank = more likely to be the "head noun" of a blended result. */
const HEAD_RANK: Record<WorldType, number> = {
  human: 10,
  animal: 9,
  vehicle: 8,
  machine: 7,
  building: 7,
  tree: 6,
  plant: 5,
  food: 5,
  celestial: 5,
  decoration: 4,
  object: 4,
  terrain: 3,
  water: 3,
  weather: 2,
  fire: 2,
  particle: 1,
  abstract: 1,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mixColor(a: string, b: string, t = 0.5): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return "#" + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

function bumpSize(size: Size, by = 1): Size {
  const i = Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + by));
  return SIZES[i];
}

function lastWord(name: string): string {
  const w = name.split(" ");
  return w[w.length - 1];
}

function withName(
  base: Lite,
  name: string,
  extra: Partial<Lite> & { addTraits?: Trait[]; description?: string },
): ItemDef {
  const traits = Array.from(new Set([...(extra.traits ?? base.traits), ...(extra.addTraits ?? [])]));
  return sanitizeItem({
    name,
    emoji: extra.emoji ?? base.emoji,
    worldType: extra.worldType ?? base.worldType,
    size: extra.size ?? base.size,
    category: extra.category ?? base.category,
    color: extra.color ?? base.color,
    traits,
    description: extra.description ?? base.description,
  })!;
}

function liteFrom(input: { name: string; emoji?: string }): Lite {
  const known = catalogItem(input.name);
  if (known) return known;
  // Unknown input (e.g. an AI-generated item when the AI is offline): guess from words.
  const guess = sanitizeItem({ name: input.name, emoji: input.emoji, worldType: guessWorldType(input.name) });
  return guess!;
}

function guessWorldType(name: string): WorldType {
  const words = itemId(name).split(" ");
  for (let i = words.length - 1; i >= 0; i--) {
    const hit = CATALOG.get(words[i]);
    if (hit) return hit.worldType;
  }
  return "object";
}

/** Generate the result of combining two items without any network/LLM access. */
export function generateFallback(
  aIn: { name: string; emoji?: string },
  bIn: { name: string; emoji?: string },
): ItemDef {
  // Recipe table first.
  const known = RECIPES.get(recipeKey(aIn.name, bIn.name));
  if (known) {
    const item = catalogItem(known);
    if (item) return item;
  }

  // Order the pair deterministically so the result is commutative.
  const [x, y] = [aIn, bIn].sort((p, q) => (itemId(p.name) < itemId(q.name) ? -1 : 1));
  const a = liteFrom(x);
  const b = liteFrom(y);
  const ida = itemId(a.name);
  const idb = itemId(b.name);
  const h = hash(ida + "::" + idb);

  // Same thing twice → a bigger version.
  if (ida === idb) {
    const prefix = a.name.startsWith("Giant ") ? "Colossal" : "Giant";
    const core = a.name.replace(/^(Giant|Colossal) /, "");
    return withName(a, `${prefix} ${lastWord(core)}`, {
      size: bumpSize(a.size, 1),
      description: `An enormous ${core.toLowerCase()}.`,
    });
  }

  // People + something → a profession.
  const human = a.worldType === "human" && ida === "human" ? a : b.worldType === "human" && idb === "human" ? b : null;
  if (human) {
    const other = human === a ? b : a;
    const role = PROFESSIONS[other.worldType] ?? "Maker";
    return withName(human, `${lastWord(other.name)} ${role}`, {
      worldType: "human",
      category: "people",
      size: "small",
      traits: ["living"],
      color: mixColor(human.color, other.color, 0.6),
      emoji: other.worldType === "animal" ? "🧑‍🌾" : other.worldType === "machine" ? "🧑‍🔧" : "🧑",
      description: `Someone who works with ${other.name.toLowerCase()}.`,
    });
  }

  // Modifier word applied to the other item.
  const modA = MODIFIERS[ida];
  const modB = MODIFIERS[idb];
  let mod: { word: string; traits?: Trait[] } | undefined;
  let modItem: Lite | undefined;
  let target: Lite | undefined;
  if (modA && (!modB || HEAD_RANK[b.worldType] >= HEAD_RANK[a.worldType])) {
    mod = modA;
    modItem = a;
    target = b;
  } else if (modB) {
    mod = modB;
    modItem = b;
    target = a;
  }
  if (mod && modItem && target && !target.name.includes(mod.word)) {
    const core = target.name.split(" ").length > 1 ? lastWord(target.name) : target.name;
    return withName(target, `${mod.word} ${core}`, {
      addTraits: mod.traits,
      color: mixColor(target.color, modItem.color, 0.35),
      description: `A ${core.toLowerCase()}, but ${mod.word.toLowerCase()}.`,
    });
  }

  // Trait-based adjective (e.g. something hot + something else).
  const head = HEAD_RANK[a.worldType] > HEAD_RANK[b.worldType] ? a : HEAD_RANK[b.worldType] > HEAD_RANK[a.worldType] ? b : h % 2 ? a : b;
  const tail = head === a ? b : a;
  for (const [trait, word] of TRAIT_MODIFIERS) {
    if (tail.traits.includes(trait) && !head.traits.includes(trait) && !head.name.includes(word)) {
      return withName(head, `${word} ${lastWord(head.name)}`, {
        addTraits: [trait],
        color: mixColor(head.color, tail.color, 0.3),
        description: `A ${lastWord(head.name).toLowerCase()} touched by ${tail.name.toLowerCase()}.`,
      });
    }
  }

  // Portmanteau blend: first part of the tail + last part of the head.
  const t = lastWord(tail.name);
  const hd = lastWord(head.name);
  const blend =
    t.slice(0, Math.max(2, Math.ceil(t.length * 0.55))) +
    hd.slice(Math.floor(hd.length * 0.45)).toLowerCase();
  return withName(head, blend, {
    size: head.size,
    color: mixColor(head.color, tail.color, 0.4),
    description: `A curious blend of ${tail.name.toLowerCase()} and ${head.name.toLowerCase()}.`,
  });
}
