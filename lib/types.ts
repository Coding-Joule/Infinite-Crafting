// Core shared types for items, recipes and world objects.
// Used by both the server (combination engine) and the client (game).

export const WORLD_TYPES = [
  "terrain",
  "plant",
  "tree",
  "building",
  "human",
  "animal",
  "vehicle",
  "weather",
  "celestial",
  "water",
  "fire",
  "particle",
  "decoration",
  "machine",
  "food",
  "object",
  "abstract",
] as const;
export type WorldType = (typeof WORLD_TYPES)[number];

export const SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
export type Size = (typeof SIZES)[number];

export const CATEGORIES = [
  "element",
  "material",
  "nature",
  "life",
  "people",
  "place",
  "structure",
  "vehicle",
  "weather",
  "space",
  "food",
  "tool",
  "tech",
  "magic",
  "concept",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Traits are a small fixed vocabulary the world simulation understands.
 * Interaction rules match on traits, never on item names, so new items
 * automatically participate in the simulation.
 */
export const TRAITS = [
  "hot", // can ignite things, melts ice
  "cold", // freezes water
  "wet", // extinguishes fire, waters seeds
  "flammable", // catches fire
  "living", // eats, flees fire
  "flying", // lives in the air
  "swimming", // prefers water
  "edible", // can be eaten
  "rideable", // humans can ride it
  "shelter", // humans can enter it
  "rail", // trains run on it
  "rails", // needs rails to move (trains)
  "seed", // grows when watered
  "light", // glows / lights the world
  "night", // darkens the world
  "electric", // sparks, lightning
  "heavy", // does not move
  "predator", // hunts other creatures
  "aquatic", // can only live in water (fish)
] as const;
export type Trait = (typeof TRAITS)[number];

export interface ItemDef {
  /** normalized lowercase name, unique */
  id: string;
  name: string;
  emoji: string;
  category: Category;
  description: string;
  worldType: WorldType;
  size: Size;
  /** main hex color used by the procedural renderer */
  color: string;
  traits: Trait[];
}

export interface Discovery extends ItemDef {
  discoveredAt: number;
  /** item ids of the first recipe that produced this item, null for starters */
  from: [string, string] | null;
  starter?: boolean;
}

export type CombineSource = "ai" | "fallback" | "cache";

export interface CombineRequestItem {
  name: string;
  emoji?: string;
}

export interface CombineResponse {
  item: ItemDef;
  source: CombineSource;
}
