import type { ItemDef } from "../types";
import { boundsOf, clampToLayer, layerBand, type Archetype } from "./archetypes";
import {
  ADULT_AGE,
  DAY_LENGTH,
  POP_LIMITS,
  burnsOut,
  canEat,
  canSwim,
  dietOf,
  fuelFor,
  isAquatic,
  isLiving,
  isNocturnal,
  isPlantLife,
  isThreat,
  lifeStage,
  lifespanDays,
  nutrition,
} from "./life";
import type { Particle, WorldObject } from "./types";
import { WORLD } from "./types";

/** What the life simulation needs from the world engine. */
export interface LifeHost {
  readonly time: number;
  readonly objects: WorldObject[];
  get(id: string): WorldObject | undefined;
  item(o: WorldObject): ItemDef | undefined;
  arch(o: WorldObject): Archetype;
  isNight(): boolean;
  isDragging(o: WorldObject): boolean;
  emit(x: number, y: number, kind: Particle["kind"], count: number, color?: string): void;
  sound(name: string): void;
  news(text: string): void;
  spawnAt(itemId: string, x: number, y: number): WorldObject | null;
  kill(o: WorldObject, cause: string): void;
  enter(o: WorldObject, host: WorldObject): void;
  exit(o: WorldObject): void;
  remove(o: WorldObject): void;
}

const THINK_INTERVAL = 0.4;

/** Per-creature damage this tick (not saved). */
interface Hazard {
  rate: number;
  cause: string;
}

export class LifeSystem {
  private thinkTimer = 0;
  private hazards = new Map<string, Hazard>();

  constructor(private host: LifeHost) {}

  // ------------------------------------------------------------ queries
  waterAt(x: number, y: number): WorldObject | undefined {
    for (const w of this.host.objects) {
      const it = this.host.item(w);
      if (!it || it.worldType !== "water" || it.traits.includes("hot")) continue;
      const b = boundsOf(this.host.arch(w), w.x, w.y);
      const nx = (x - (b.x + b.w / 2)) / (b.w / 2);
      const ny = (y - (b.y + b.h / 2)) / (b.h / 2);
      if (nx * nx + ny * ny <= 1) return w;
    }
    return undefined;
  }

  private walkable(item: ItemDef, x: number, y: number): boolean {
    if (canSwim(item)) return true;
    const w = this.waterAt(x, y);
    return !w || (w.state.frozen ?? 0) > 0;
  }

  /** Pick a wandering goal that respects water (used by the engine's wander). */
  wanderGoal(o: WorldObject, item: ItemDef, arch: Archetype): [number, number] | null {
    if (isAquatic(item)) {
      const pool = this.waterAt(o.x, o.y);
      if (!pool) return null;
      const b = boundsOf(this.host.arch(pool), pool.x, pool.y);
      for (let i = 0; i < 6; i++) {
        const gx = b.x + b.w * (0.15 + Math.random() * 0.7);
        const gy = b.y + b.h * (0.3 + Math.random() * 0.5);
        if (this.waterAt(gx, gy) === pool) return [gx, gy];
      }
      return null;
    }
    for (let i = 0; i < 5; i++) {
      const [gx, gy] = clampToLayer(arch.layer, o.x + (Math.random() - 0.5) * 420, o.y + (Math.random() - 0.5) * 140);
      if (this.walkable(item, gx, gy)) return [gx, gy];
    }
    return null;
  }

  private sleepyTime(item: ItemDef): boolean {
    const night = this.host.isNight();
    return isNocturnal(item) ? !night : night;
  }

  /** Time to go to bed? */
  shouldSleep(o: WorldObject, item: ItemDef): boolean {
    const st = o.state;
    if ((st.food ?? 100) < 12) return false; // too hungry to sleep
    if ((st.rest ?? 100) < 8) return true; // exhausted
    return this.sleepyTime(item) && (st.rest ?? 100) < 85;
  }

  /** Time to get up? Sleep lasts through the night; naps end once rested. */
  shouldWake(o: WorldObject, item: ItemDef): boolean {
    if ((o.state.food ?? 100) < 8) return true; // hunger wakes you
    return !this.sleepyTime(item) && (o.state.rest ?? 0) > 60;
  }

  // ------------------------------------------------------------ main loop
  update(dt: number) {
    const h = this.host;
    for (const o of h.objects) {
      const item = h.item(o);
      if (!item) continue;
      if (isLiving(item)) this.vitals(o, item, dt);
      else if (isPlantLife(item)) this.plant(o, item, dt);
      else if (burnsOut(item)) this.fire(o, item, dt);
      else if (item.worldType === "building" && o.state.charred) this.rebuild(o, item, dt);
    }
    this.thinkTimer += dt;
    if (this.thinkTimer >= THINK_INTERVAL) {
      const step = this.thinkTimer;
      this.thinkTimer = 0;
      this.hazards.clear();
      const snapshot = [...h.objects];
      for (const o of snapshot) {
        if (!h.get(o.id)) continue; // removed this tick
        const item = h.item(o);
        if (!item) continue;
        if (isLiving(item)) this.think(o, item, step);
        else if (isPlantLife(item)) this.plantThink(o, item, step);
      }
    }
  }

  // ------------------------------------------------------------ bodies
  private vitals(o: WorldObject, item: ItemDef, dt: number) {
    const st = o.state;
    st.hp ??= 100;
    st.food ??= 80;
    st.rest ??= 90;
    st.age ??= 2; // things you place are grown-ups
    st.age += dt / DAY_LENGTH;

    const forages = item.traits.includes("flying") || (isAquatic(item) && dietOf(item) !== "carnivore");
    const wasFed = st.food >= 15;
    // People pace their meals better than wild animals.
    const daysToEmpty = item.worldType === "human" ? 1.7 : 1.3;
    if (!forages) st.food = Math.max(0, st.food - (dt * 100) / (daysToEmpty * DAY_LENGTH) * (st.sleeping ? 0.5 : 1));
    if (wasFed && st.food < 15 && !st.hidden) {
      this.host.news(`⚠️ ${/^[aeiou]/i.test(item.name) ? "An" : "A"} ${item.name} is starving — ${dietOf(item) === "carnivore" ? "it needs prey" : "place some food nearby"}`);
    }
    if (st.sleeping) st.rest = Math.min(100, st.rest + (dt * 100) / (0.3 * DAY_LENGTH));
    else st.rest = Math.max(0, st.rest - (dt * 100) / (0.9 * DAY_LENGTH));

    const hz = this.hazards.get(o.id);
    let damage = 0;
    let cause = "";
    if (hz) {
      damage += hz.rate;
      cause = hz.cause;
    }
    if (st.food <= 0) {
      damage += 0.7;
      cause ||= "starved to death";
    }
    if (damage > 0) {
      st.hp -= damage * dt;
      if (Math.random() < dt * 3 && hz) this.host.emit(o.x, o.y - 30, "spark", 1, "#ff6b6b");
    } else if (st.food > 35) {
      st.hp = Math.min(100, st.hp + dt * 0.5);
    }
    if (st.hp <= 0) {
      this.host.kill(o, cause || "died");
      return;
    }
    if (st.age > lifespanDays(item, o.seed)) {
      this.host.kill(o, "died peacefully of old age");
      return;
    }

    // Waking up inside a shelter.
    if (st.hidden && st.sleeping && st.insideId) {
      if (this.shouldWake(o, item)) {
        st.sleeping = false;
        this.host.exit(o);
      }
    }
    if (st.sleeping && !st.hidden && Math.random() < dt * 0.7) {
      this.host.emit(o.x + 10, o.y - this.host.arch(o).h * 0.6, "zzz", 1, "#ffffff");
    }
  }

  private hurt(o: WorldObject, rate: number, cause: string) {
    const prev = this.hazards.get(o.id);
    if (!prev || prev.rate < rate) this.hazards.set(o.id, { rate, cause });
  }

  /** Lightning hit the ground at x. */
  strike(x: number) {
    for (const o of this.host.objects) {
      const it = this.host.item(o);
      if (!it || !isLiving(it) || o.state.hidden) continue;
      if (Math.abs(o.x - x) < 45 && this.host.arch(o).layer === "ground") this.host.kill(o, "was struck by lightning");
    }
  }

  // ------------------------------------------------------------ decisions
  private think(o: WorldObject, item: ItemDef, step: number) {
    const h = this.host;
    const st = o.state;
    if (st.hidden || st.pending || h.isDragging(o)) {
      if (st.hidden) st.activity = st.sleeping ? "Sleeping at home" : st.activity;
      return;
    }
    const arch = h.arch(o);
    const onGround = arch.layer === "ground";

    // --- environmental hazards
    let danger = false;
    for (const s of h.objects) {
      if (s === o || s.state.hidden) continue;
      const si = h.item(s);
      if (!si) continue;
      const sl = h.arch(s).layer;
      const hot = ((si.traits.includes("hot") && si.worldType !== "weather" && si.worldType !== "celestial" && !isLiving(si)) || (s.state.burning ?? 0) > 0) && (sl === "ground" || sl === "flat" || sl === "background");
      if (hot && onGround && !item.traits.includes("hot")) {
        const sb = boundsOf(h.arch(s), s.x, s.y);
        const dx = Math.abs(o.x - s.x);
        const dy = Math.abs(o.y - s.y) * 1.6;
        const reach = sb.w * 0.4 + 18;
        if (dx < reach && dy < reach) {
          this.hurt(o, si.traits.includes("heavy") ? 60 : 30, si.worldType === "fire" && si.traits.includes("heavy") ? "fell into the lava" : "burned in a fire");
          danger = true;
        }
      }
      if (si.worldType === "weather" && si.traits.includes("cold") && !item.traits.includes("cold") && Math.abs(s.x - o.x) < h.arch(s).w * 0.5) {
        this.hurt(o, 0.5, "froze in the snow");
      }
    }
    const pool = onGround ? this.waterAt(o.x, o.y) : undefined;
    const inWater = !!pool && (pool.state.frozen ?? 0) <= 0;
    if (inWater && !canSwim(item)) {
      this.hurt(o, 9, "drowned");
      st.activity = "Drowning!";
      const b = boundsOf(h.arch(pool!), pool!.x, pool!.y);
      const up = o.y < pool!.y;
      st.goalX = o.x;
      st.goalY = up ? Math.max(layerBand("ground")[0], b.y - 24) : Math.min(WORLD.H - 20, b.y + b.h + 24);
      st.intent = undefined;
      return;
    }
    if (isAquatic(item) && onGround && !inWater) {
      this.hurt(o, 6, "suffocated out of water");
      st.activity = "Gasping for water!";
      const near = this.nearest(o, (w, wi) => wi.worldType === "water" && !wi.traits.includes("hot"), 700);
      if (near) {
        st.goalX = near.x;
        st.goalY = near.y + 4;
      } else {
        st.goalX = st.goalY = undefined;
        st.pause = 1;
      }
      return;
    }

    // --- sleeping outdoors
    if (st.sleeping) {
      const threat = this.nearestThreat(o, item, 200);
      if (danger || threat || this.shouldWake(o, item)) {
        st.sleeping = false;
        st.pause = 0.5;
      } else {
        st.activity = "Sleeping";
        return;
      }
    }

    // --- predators nearby: run
    const threat = this.nearestThreat(o, item, 260);
    if (threat) {
      const tname = h.item(threat)?.name ?? "predator";
      st.fleeing = 1.5;
      // People run indoors when they can.
      if (item.worldType === "human") {
        const refuge = this.nearest(o, (w, wi) => wi.traits.includes("shelter") && wi.worldType === "building" && !((w.state.burning ?? 0) > 0) && Math.sign(w.x - o.x) !== Math.sign(threat.x - o.x), 500);
        if (refuge) {
          if (st.targetId !== refuge.id) {
            this.clearIntent(o);
            st.intent = "enter";
            st.targetId = refuge.id;
            st.goalX = refuge.x;
            st.goalY = refuge.y + 2;
            st.giveUpAt = h.time + 20;
          }
          st.activity = `Running inside — a ${tname}!`;
          return;
        }
      }
      if (st.intent !== "eat") this.clearIntent(o);
      const goal = this.fleeGoal(o, item, arch, threat);
      if (goal) [st.goalX, st.goalY] = goal;
      st.activity = `Running from a ${tname}!`;
      return;
    }
    if (danger) return; // flee-fire rule already moves them

    // --- busy with something: keep at it unless it's taking too long
    if (st.intent) {
      const tgt = st.targetId ? h.get(st.targetId) : undefined;
      const preyLeftWater = isAquatic(item) && tgt && !this.waterAt(tgt.x, tgt.y);
      if (preyLeftWater || (st.giveUpAt !== undefined && h.time > st.giveUpAt)) {
        this.clearIntent(o);
        st.goalX = st.goalY = undefined;
      } else {
        const t = st.targetId ? h.get(st.targetId) : undefined;
        const tn = t ? h.item(t)?.name : undefined;
        st.activity =
          st.intent === "eat" ? (t && isLiving(h.item(t)!) ? `Hunting a ${tn}` : `Going to eat ${tn ?? "food"}`) :
          st.intent === "sleep" ? "Going home to sleep" :
          st.intent === "enter" ? `Visiting the ${tn ?? "building"}` :
          st.intent === "ride" ? `Going to drive the ${tn ?? "vehicle"}` :
          st.intent === "douse" ? "Putting out a fire" : st.activity;
        return;
      }
    }

    // --- tired: sleep
    if (this.shouldSleep(o, item)) {
      if (item.worldType === "human") {
        const home = this.pickHome(o);
        if (home) {
          this.setIntent(o, "sleep", home, 40);
          st.activity = "Going home to sleep";
          return;
        }
      }
      st.sleeping = true;
      st.goalX = st.goalY = undefined;
      st.activity = "Sleeping";
      return;
    }

    // --- hungry: find food
    const hungerLine = dietOf(item) === "carnivore" ? 45 : 55;
    if ((st.food ?? 100) < hungerLine) {
      const food = this.findFood(o, item);
      if (food) {
        const prey = isLiving(h.item(food)!);
        this.setIntent(o, "eat", food, prey ? 14 : 30);
        st.activity = prey ? `Hunting a ${h.item(food)!.name}` : `Going to eat ${h.item(food)!.name}`;
        return;
      }
      st.activity = (st.food ?? 0) < 15 ? "Starving — needs food!" : "Hungry, looking for food";
    } else {
      st.activity = item.worldType === "human" ? "Out and about" : "Wandering";
    }

    // --- start a family
    this.tryBreed(o, item, step);
  }

  /** A spot away from the threat that this creature can actually live in. */
  private fleeGoal(o: WorldObject, item: ItemDef, arch: Archetype, threat: WorldObject): [number, number] | null {
    const away = Math.sign(o.x - threat.x || 1);
    const pool = isAquatic(item) ? this.waterAt(o.x, o.y) : undefined;
    for (const dist of [320, 220, 140, -200]) {
      const [gx, gy] = clampToLayer(arch.layer, o.x + away * dist, o.y + (Math.random() - 0.5) * 120);
      if (pool ? this.waterAt(gx, gy) === pool : this.walkable(item, gx, gy)) return [gx, gy];
    }
    return null;
  }

  private setIntent(o: WorldObject, intent: "eat" | "sleep", target: WorldObject, patience: number) {
    o.state.intent = intent;
    o.state.targetId = target.id;
    o.state.goalX = target.x;
    o.state.goalY = target.y + 2;
    o.state.giveUpAt = this.host.time + patience;
  }

  private clearIntent(o: WorldObject) {
    const t = o.state.targetId ? this.host.get(o.state.targetId) : undefined;
    if (t && o.state.intent === "ride" && t.state.riderId === o.id && !t.state.riderItemId) t.state.riderId = undefined;
    o.state.intent = undefined;
    o.state.targetId = undefined;
    o.state.giveUpAt = undefined;
  }

  private nearest(o: WorldObject, pred: (w: WorldObject, wi: ItemDef) => boolean, maxDist: number): WorldObject | undefined {
    let best: WorldObject | undefined;
    let bd = maxDist * maxDist;
    for (const w of this.host.objects) {
      if (w === o || w.state.hidden || w.state.pending) continue;
      const wi = this.host.item(w);
      if (!wi || !pred(w, wi)) continue;
      const dx = w.x - o.x;
      const dy = (w.y - o.y) * 1.4;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  private nearestThreat(o: WorldObject, item: ItemDef, range: number) {
    return this.nearest(o, (w, wi) => isLiving(wi) && isThreat(item, wi) && !w.state.sleeping && this.host.arch(w).layer === this.host.arch(o).layer, range);
  }

  private findFood(o: WorldObject, item: ItemDef): WorldObject | undefined {
    const h = this.host;
    return this.nearest(
      o,
      (w, wi) => {
        if (!canEat(item, wi)) return false;
        if (w.state.charred || (w.state.burning ?? 0) > 0) return false;
        if (wi.worldType === "plant" || wi.worldType === "tree") return (w.state.growth ?? 1) > 0.25;
        if (isLiving(wi)) {
          if (h.arch(w).layer !== h.arch(o).layer) return false;
          if (isAquatic(item)) return !!this.waterAt(w.x, w.y); // sharks can't chase onto land
          return this.walkable(item, w.x, w.y);
        }
        return this.walkable(item, w.x, w.y);
      },
      dietOf(item) === "carnivore" ? 650 : 900,
    );
  }

  private pickHome(o: WorldObject): WorldObject | undefined {
    const h = this.host;
    const ok = (w: WorldObject, wi: ItemDef) =>
      wi.traits.includes("shelter") && wi.worldType === "building" && !w.state.charred && !((w.state.burning ?? 0) > 0) && (w.state.occupants ?? 0) < 6;
    const home = o.state.homeId ? h.get(o.state.homeId) : undefined;
    if (home) {
      const hi = h.item(home);
      if (hi && ok(home, hi)) return home;
    }
    const found = this.nearest(o, ok, 1400);
    if (found) o.state.homeId = found.id;
    return found;
  }

  /** The creature reached the target of its intent. Returns true if handled. */
  arrive(o: WorldObject, intent: string, t: WorldObject): boolean {
    const h = this.host;
    const item = h.item(o);
    const ti = h.item(t);
    if (!item || !ti) return false;
    if (intent === "sleep") {
      o.state.homeId = t.id;
      o.state.sleeping = true;
      h.enter(o, t);
      o.state.activity = "Sleeping at home";
      return true;
    }
    if (intent !== "eat") return false;
    if (isLiving(ti)) {
      if (Math.hypot(t.x - o.x, t.y - o.y) > 40) return true; // it got away
      h.kill(t, `was eaten by a ${item.name}`);
      o.state.food = Math.min(100, (o.state.food ?? 0) + nutrition(ti));
      h.sound("munch");
      return true;
    }
    if (ti.worldType === "plant" || ti.worldType === "tree") {
      t.state.growth = Math.max(0.12, (t.state.growth ?? 1) - 0.35);
      o.state.food = Math.min(100, (o.state.food ?? 0) + 45);
      h.emit(t.x, t.y - 15, "puff", 3, "#7ccf5a");
    } else {
      h.remove(t);
      o.state.food = Math.min(100, (o.state.food ?? 0) + nutrition(ti));
    }
    h.emit(o.x, o.y - 30, "heart", 1, "#ff6b8a");
    h.sound("munch");
    return true;
  }

  private tryBreed(o: WorldObject, item: ItemDef, step: number) {
    const h = this.host;
    const st = o.state;
    const ready = (w: WorldObject) =>
      lifeStage(item, w.state.age ?? 2, w.seed) === "adult" &&
      (w.state.hp ?? 100) > 70 &&
      (w.state.food ?? 0) > 50 &&
      !w.state.sleeping &&
      !w.state.hidden &&
      h.time - (w.state.lastBred ?? -1e9) > DAY_LENGTH * 0.9;
    if (!ready(o)) return;
    if (Math.random() > step * 0.25) return;
    let species = 0;
    let living = 0;
    for (const w of h.objects) {
      const wi = h.item(w);
      if (!wi || !isLiving(wi)) continue;
      living++;
      if (w.itemId === o.itemId) species++;
    }
    if (species >= POP_LIMITS.perSpecies || living >= POP_LIMITS.livingTotal) return;
    const mate = this.nearest(o, (w) => w.itemId === o.itemId && ready(w), 450);
    if (!mate) return;
    if (item.worldType === "human" && !this.nearest(o, (_w, wi) => wi.traits.includes("shelter"), 900)) return;
    const d = Math.hypot(mate.x - o.x, mate.y - o.y);
    if (d > 50) {
      st.goalX = mate.x;
      st.goalY = mate.y;
      st.activity = `Looking for love`;
      return;
    }
    const baby = h.spawnAt(o.itemId, (o.x + mate.x) / 2, Math.max(o.y, mate.y) + 10);
    if (!baby) return;
    baby.state = { age: 0, hp: 100, food: 90, rest: 100 };
    st.lastBred = mate.state.lastBred = h.time;
    h.emit((o.x + mate.x) / 2, o.y - 40, "heart", 3, "#ff6b8a");
    h.news(`👶 A baby ${item.name} was born!`);
  }

  // ------------------------------------------------------------ plants
  private plant(o: WorldObject, _item: ItemDef, dt: number) {
    const st = o.state;
    if (st.charred) {
      st.regrow = (st.regrow ?? 0) + dt;
      return;
    }
    if (st.growth !== undefined && st.growth < 1) {
      st.growth = Math.min(1, st.growth + dt / (DAY_LENGTH * 0.8));
      if (st.growth >= 1) st.growth = undefined;
    }
  }

  private plantThink(o: WorldObject, item: ItemDef, step: number) {
    const h = this.host;
    const st = o.state;
    const wet = this.isWatered(o);
    if (st.charred) {
      if ((st.regrow ?? 0) * (wet ? 2 : 1) > DAY_LENGTH * 0.5) {
        st.charred = false;
        st.regrow = undefined;
        st.growth = 0.15;
        h.news(`🌱 The burnt ${item.name} is growing back`);
      }
      return;
    }
    if (st.growth !== undefined || (st.burning ?? 0) > 0 || h.arch(o).layer !== "ground") return;
    const rate = 1 / (DAY_LENGTH * (wet ? 0.5 : 2));
    if (Math.random() > rate * step) return;
    let species = 0;
    let plants = 0;
    for (const w of h.objects) {
      const wi = h.item(w);
      if (!wi || !isPlantLife(wi)) continue;
      plants++;
      if (w.itemId === o.itemId) species++;
    }
    if (species >= POP_LIMITS.plantsPerSpecies || plants >= POP_LIMITS.plantsTotal) return;
    for (let i = 0; i < 4; i++) {
      const dist = 100 + Math.random() * 180;
      const [x, y] = clampToLayer("ground", o.x + (Math.random() < 0.5 ? -1 : 1) * dist, o.y + (Math.random() - 0.5) * 120);
      if (this.waterAt(x, y)) continue;
      const crowded = h.objects.some((w) => {
        const wi = h.item(w);
        if (!wi || h.arch(w).layer !== "ground" || (!isPlantLife(wi) && wi.worldType !== "building")) return false;
        return Math.abs(w.x - x) < h.arch(w).w * 0.6 + 20 && Math.abs(w.y - y) < 40;
      });
      if (crowded) continue;
      const child = h.spawnAt(o.itemId, x, y);
      if (child) child.state = { growth: 0.08 };
      return;
    }
  }

  private isWatered(o: WorldObject): boolean {
    const h = this.host;
    return h.objects.some((w) => {
      const wi = h.item(w);
      if (!wi) return false;
      if (wi.worldType === "water" && !wi.traits.includes("hot")) return Math.abs(w.x - o.x) < 450 && Math.abs(w.y - o.y) < 300;
      if (wi.worldType === "weather" && (wi.traits.includes("wet") || (w.state.raining ?? 0) > 0)) return Math.abs(w.x - o.x) < h.arch(w).w * 0.5 + 60;
      return false;
    });
  }

  /** People living nearby slowly rebuild burnt buildings. */
  private rebuild(o: WorldObject, item: ItemDef, dt: number) {
    const h = this.host;
    const builders = h.objects.filter((w) => {
      const wi = h.item(w);
      return !!wi && wi.worldType === "human" && isLiving(wi) && Math.abs(w.x - o.x) < 700;
    }).length;
    if (!builders) return;
    o.state.regrow = (o.state.regrow ?? 0) + dt * Math.min(3, builders);
    if (Math.random() < dt * 0.8) h.emit(o.x + (Math.random() - 0.5) * 40, o.y - 30, "spark", 1, "#c8a46a");
    if (o.state.regrow > DAY_LENGTH * 0.7) {
      o.state.charred = false;
      o.state.regrow = undefined;
      h.emit(o.x, o.y - 40, "star", 12, "#ffd84a");
      h.news(`🔨 The neighbors rebuilt the ${item.name}`);
    }
  }

  // ------------------------------------------------------------ fire
  private fire(o: WorldObject, item: ItemDef, dt: number) {
    const st = o.state;
    st.fuel ??= fuelFor(item);
    st.fuel -= dt;
    if (st.fuel <= 0) {
      this.host.emit(o.x, o.y - 20, "puff", 10, "#8a8a92");
      this.host.news(`💨 The ${item.name} burned out`);
      this.host.remove(o);
    }
  }
}

export { ADULT_AGE };
