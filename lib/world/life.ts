import type { ItemDef, Size } from "../types";

/**
 * Pure rules for the life simulation: who is alive, what they eat, how long
 * they live. Everything is derived from worldType / size / traits so any
 * item — including ones the AI invents — gets sensible real-world behavior.
 */

/** Seconds of world time in one in-game day (also the day/night cycle length). */
export const DAY_LENGTH = 300;

export const SIZE_RANK: Record<Size, number> = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4 };

export type Diet = "herbivore" | "carnivore" | "omnivore";

const has = (i: ItemDef, t: string) => i.traits.includes(t as never);

/** Creatures that need food, sleep, can be hurt, age and die. */
export function isLiving(i: ItemDef): boolean {
  return (i.worldType === "human" || i.worldType === "animal") && has(i, "living");
}

/** Supernatural or mythical beings don't age (dragons, ghosts, unicorns…). */
export function isAgeless(i: ItemDef): boolean {
  return i.category === "magic" || i.category === "space";
}

export function dietOf(i: ItemDef): Diet {
  if (has(i, "predator")) return "carnivore";
  if (i.worldType === "human") return "omnivore";
  return "herbivore";
}

export function isAquatic(i: ItemDef): boolean {
  return has(i, "aquatic");
}

export function canSwim(i: ItemDef): boolean {
  return has(i, "swimming") || has(i, "aquatic") || has(i, "flying");
}

/** Nocturnal creatures sleep during the day. */
export function isNocturnal(i: ItemDef): boolean {
  return has(i, "night");
}

/** Expected lifespan in in-game days (varies a little per individual). */
export function lifespanDays(i: ItemDef, seed: number): number {
  const jitter = 0.85 + ((seed % 1000) / 1000) * 0.3;
  if (isAgeless(i)) return Infinity;
  if (i.worldType === "human") return 14 * jitter;
  const base: Record<Size, number> = { tiny: 5, small: 8, medium: 11, large: 16, huge: 22 };
  return base[i.size] * jitter;
}

/** Days until a newborn is an adult. */
export const ADULT_AGE = 1;

export type LifeStage = "baby" | "adult" | "elder";

export function lifeStage(i: ItemDef, age: number, seed: number): LifeStage {
  if (age < ADULT_AGE) return "baby";
  if (age > lifespanDays(i, seed) * 0.8) return "elder";
  return "adult";
}

/** Render scale for a creature of a given age (babies are small). */
export function ageScale(age: number | undefined): number {
  if (age === undefined || age >= ADULT_AGE) return 1;
  return 0.5 + 0.5 * Math.max(0, age / ADULT_AGE);
}

/** Render scale for a growing plant. */
export function growthScale(growth: number | undefined): number {
  if (growth === undefined || growth >= 1) return 1;
  return 0.3 + 0.7 * Math.max(0, growth);
}

/** Is `food` something `eater` can eat right now? */
export function canEat(eater: ItemDef, food: ItemDef): boolean {
  if (eater.id === food.id) return false;
  const diet = dietOf(eater);
  // Prepared food and edible objects.
  if (food.worldType === "food" && has(food, "edible") && !has(food, "seed")) return diet !== "carnivore";
  // Animals graze on plants; people only harvest crops and fruit (category "food").
  if ((food.worldType === "plant" || food.worldType === "tree") && has(food, "edible") && !has(food, "seed")) {
    if (diet === "herbivore") return true;
    return diet === "omnivore" && food.category === "food";
  }
  return canHunt(eater, food);
}

/** Can a predator (or a person) catch and eat this creature? */
export function canHunt(hunter: ItemDef, prey: ItemDef): boolean {
  if (!isLiving(prey) || hunter.id === prey.id) return false;
  if (has(prey, "flying") && !has(hunter, "flying")) return false;
  if (isAquatic(prey) !== isAquatic(hunter) && !has(hunter, "swimming")) return false;
  const diet = dietOf(hunter);
  const hr = SIZE_RANK[hunter.size];
  const pr = SIZE_RANK[prey.size];
  if (diet === "carnivore") {
    if (has(prey, "predator") && pr >= hr - 1) return false; // predators don't hunt their equals
    if (prey.worldType === "human") return hr >= SIZE_RANK.medium;
    // Big hunters take prey their own size (lions and buffalo); small ones only smaller prey.
    return hr >= SIZE_RANK.medium ? pr <= hr : pr < hr;
  }
  // People only hunt small edible animals (chickens, fish, crabs).
  if (diet === "omnivore") return has(prey, "edible") && pr <= SIZE_RANK.small && prey.worldType === "animal";
  return false;
}

/** Is `threat` dangerous to `me` (so I should run)? */
export function isThreat(me: ItemDef, threat: ItemDef): boolean {
  return dietOf(threat) === "carnivore" && canHunt(threat, me);
}

/** How much a meal fills you up (0..100). */
export function nutrition(food: ItemDef): number {
  if (isLiving(food)) return 70 + SIZE_RANK[food.size] * 10;
  if (food.worldType === "food") return 55 + SIZE_RANK[food.size] * 10;
  return 35;
}

/** Seconds a fire burns before running out of fuel. */
export function fuelFor(i: ItemDef): number {
  const base: Record<Size, number> = { tiny: 70, small: 160, medium: 260, large: 420, huge: 600 };
  return base[i.size];
}

/** Fires that need fuel (lava and volcanoes don't burn out). */
export function burnsOut(i: ItemDef): boolean {
  return i.worldType === "fire" && !has(i, "heavy");
}

/** Plants and trees grow, spread seeds and regrow after fires. */
export function isPlantLife(i: ItemDef): boolean {
  return (i.worldType === "plant" || i.worldType === "tree") && !has(i, "seed");
}

/** Population limits keep the world lively without overwhelming it. */
export const POP_LIMITS = { perSpecies: 10, livingTotal: 70, plantsPerSpecies: 10, plantsTotal: 60 };
