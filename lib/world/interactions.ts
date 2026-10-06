import type { ItemDef, Trait } from "../types";
import type { Archetype } from "./archetypes";
import type { WorldObject } from "./types";

/**
 * Data-driven world interactions. Each rule pairs two kinds of objects
 * (matched by traits / world types / state — never by item name) and fires an
 * effect with some probability per second while they are within range.
 * Add new behavior by appending a rule here.
 */
export interface Sim {
  time: number;
  item(o: WorldObject): ItemDef | undefined;
  arch(o: WorldObject): Archetype;
  has(o: WorldObject, trait: Trait): boolean;
  emit(x: number, y: number, kind: "puff" | "spark" | "ember" | "drop" | "heart" | "star", count: number, color?: string): void;
  ignite(o: WorldObject): void;
  remove(o: WorldObject): void;
  /** Turn an object into the result of combining it with another item (async). */
  transform(o: WorldObject, withItemId: string): void;
  sound(name: "ignite" | "splash" | "pop" | "zap" | "munch"): void;
}

type Matcher = (o: WorldObject, item: ItemDef, sim: Sim) => boolean;

export interface InteractionRule {
  id: string;
  a: Matcher;
  b: Matcher;
  /**
   * "near": anchors within `range` (depth distance counts a bit more).
   * "below": b is under a's horizontal span (weather/sky affecting the ground).
   */
  mode: "near" | "below";
  range: number;
  /** probability per second for each matching pair */
  chance: number;
  effect: (sim: Sim, a: WorldObject, b: WorldObject) => void;
}

const visible: Matcher = (o) => !o.state.hidden && !o.state.pending;
const and =
  (...ms: Matcher[]): Matcher =>
  (o, i, s) =>
    ms.every((m) => m(o, i, s));
const trait =
  (...ts: Trait[]): Matcher =>
  (_o, i) =>
    ts.some((t) => i.traits.includes(t));
const notTrait =
  (...ts: Trait[]): Matcher =>
  (_o, i) =>
    !ts.some((t) => i.traits.includes(t));
const type =
  (...ws: ItemDef["worldType"][]): Matcher =>
  (_o, i) =>
    ws.includes(i.worldType);
const onGround: Matcher = (o, _i, s) => {
  const l = s.arch(o).layer;
  return l === "ground" || l === "flat" || l === "background";
};

const burning: Matcher = (o) => (o.state.burning ?? 0) > 0;
const isRaining: Matcher = (o, i) => i.worldType === "weather" && (i.traits.includes("wet") || (o.state.raining ?? 0) > 0);
const flammable = and(visible, trait("flammable"), (o) => !o.state.charred && !((o.state.burning ?? 0) > 0));
const hotSource = and(visible, onGround, (o, i) => (i.traits.includes("hot") && i.worldType !== "weather") || (o.state.burning ?? 0) > 0);
const awake: Matcher = (o) => !o.state.sleeping;
const walker = and(visible, awake, type("human"), (o, _i, s) => s.arch(o).movement === "wander", (o) => !o.state.intent);
const anyCreature = and(visible, trait("living"), (o, _i, s) => s.arch(o).movement === "wander");
const creature = and(anyCreature, awake);
const waterBody = and(type("water"), notTrait("hot"));

export const INTERACTION_RULES: InteractionRule[] = [
  {
    id: "ignite",
    a: hotSource,
    b: flammable,
    mode: "near",
    range: 90,
    chance: 0.6,
    effect: (s, _a, b) => s.ignite(b),
  },
  {
    id: "rain-douses-fire",
    a: isRaining,
    b: and(onGround, (o, i) => (o.state.burning ?? 0) > 0 || (i.worldType === "fire" && !i.traits.includes("heavy"))),
    mode: "below",
    range: 0,
    chance: 4,
    effect: (s, _a, b) => {
      if ((b.state.burning ?? 0) > 0) {
        b.state.burning = 0;
        s.emit(b.x, b.y - 40, "puff", 6, "#e6edf3");
        s.sound("splash");
        return;
      }
      b.state.doused = (b.state.doused ?? 0) + 0.25;
      s.emit(b.x, b.y - 20, "puff", 2, "#e6edf3");
      if (b.state.doused >= 3) {
        s.emit(b.x, b.y - 20, "puff", 10, "#dfe6ee");
        s.sound("splash");
        s.remove(b);
      }
    },
  },
  {
    id: "cloud-gathers-rain",
    a: and(type("weather"), notTrait("wet", "cold", "electric", "light"), (o) => !((o.state.raining ?? 0) > 0)),
    b: waterBody,
    mode: "below",
    range: 260,
    chance: 0.08,
    effect: (s, a) => {
      a.state.raining = 18 + Math.random() * 10;
      s.sound("splash");
    },
  },
  {
    id: "snow-freezes-water",
    a: and(type("weather"), trait("cold")),
    b: waterBody,
    mode: "below",
    range: 0,
    chance: 0.5,
    effect: (_s, _a, b) => {
      b.state.frozen = 30;
    },
  },
  {
    id: "heat-melts-ice",
    a: hotSource,
    b: and(type("water"), (o) => (o.state.frozen ?? 0) > 0),
    mode: "near",
    range: 200,
    chance: 1,
    effect: (s, _a, b) => {
      b.state.frozen = 0;
      s.emit(b.x, b.y - 10, "puff", 8, "#e6edf3");
    },
  },
  {
    id: "lava-hisses",
    a: and(onGround, trait("hot"), type("fire", "terrain")),
    b: waterBody,
    mode: "near",
    range: 220,
    chance: 0.8,
    effect: (s, a) => s.emit(a.x, a.y - 30, "puff", 3, "#eef2f6"),
  },
  {
    id: "seed-grows",
    a: and(trait("seed"), type("plant"), visible),
    b: (o, i, s) => isRaining(o, i, s) || waterBody(o, i, s),
    mode: "near",
    range: 320,
    chance: 3,
    effect: (s, a) => {
      a.state.growth = (a.state.growth ?? 0) + 0.08;
      if (a.state.growth >= 1 && !a.state.pending) {
        s.emit(a.x, a.y - 20, "star", 10, "#9fe870");
        s.transform(a, "water");
      }
    },
  },
  {
    id: "flee-fire",
    a: hotSource,
    b: and(anyCreature, notTrait("wet")),
    mode: "near",
    range: 140,
    chance: 4,
    effect: (_s, a, b) => {
      b.state.sleeping = false; // fire wakes you up
      if (b.state.intent) return;
      b.state.fleeing = 2.5;
      b.state.goalX = b.x + Math.sign(b.x - a.x || 1) * 260;
      b.state.goalY = b.y + (Math.random() - 0.5) * 60;
    },
  },
  {
    id: "enter-shelter",
    a: walker,
    b: and(visible, trait("shelter"), type("building"), (o) => (o.state.occupants ?? 0) < 4 && !((o.state.burning ?? 0) > 0)),
    mode: "near",
    range: 260,
    chance: 0.07,
    effect: (_s, a, b) => {
      a.state.intent = "enter";
      a.state.targetId = b.id;
      a.state.goalX = b.x;
      a.state.goalY = b.y + 4;
    },
  },
  {
    id: "ride-vehicle",
    a: walker,
    b: and(visible, trait("rideable"), (o) => !o.state.riderId),
    mode: "near",
    range: 500,
    chance: 0.08,
    effect: (_s, a, b) => {
      b.state.riderId = a.id; // reserve
      a.state.intent = "ride";
      a.state.targetId = b.id;
      a.state.goalX = b.x;
      a.state.goalY = b.y + 2;
    },
  },
  {
    // Wet creatures (firefighters, water spirits…) go and put fires out.
    id: "fight-fire",
    a: and(creature, trait("wet"), (o) => !o.state.intent),
    b: and(onGround, (o, i) => (o.state.burning ?? 0) > 0 || (i.worldType === "fire" && !i.traits.includes("heavy"))),
    mode: "near",
    range: 900,
    chance: 3,
    effect: (_s, a, b) => {
      a.state.intent = "douse";
      a.state.targetId = b.id;
      a.state.goalX = b.x;
      a.state.goalY = b.y + 2;
    },
  },
  {
    id: "spread-fire",
    a: and(visible, burning),
    b: flammable,
    mode: "near",
    range: 120,
    chance: 0.25,
    effect: (s, _a, b) => s.ignite(b),
  },
];
