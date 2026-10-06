import type { ItemDef, Trait } from "../types";
import {
  LAYER_ORDER,
  archetypeFor,
  boundsOf,
  clampToLayer,
  layerBand,
  type Archetype,
} from "./archetypes";
import { INTERACTION_RULES, type Sim } from "./interactions";
import { RENDERERS, drawBurning } from "./renderers";
import { hashString, mix, rand, rgba } from "./sprites";
import { WORLD, type Particle, type SavedWorld, type WorldObject } from "./types";

export interface EngineOptions {
  getItem: (id: string) => ItemDef | undefined;
  /** Combine two items; resolves with the resulting item id (or null on failure). */
  onCombine: (a: string, b: string) => Promise<string | null>;
  onSelect: (id: string | null) => void;
  onSave: (data: SavedWorld) => void;
  onCountChange?: (n: number) => void;
  onSound?: (name: string) => void;
  /** screen rect of the trash zone (client coords), if visible */
  getTrashRect?: () => DOMRect | null;
  onDragObject?: (dragging: boolean, overTrash: boolean) => void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface PointerInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
  type: string;
}

const DWELL = 0.5; // seconds hovering over another object before a drop combines
const DAY_LENGTH = 300; // seconds for a full day/night cycle

export class WorldEngine implements Sim {
  objects: WorldObject[] = [];
  private byId = new Map<string, WorldObject>();
  private particles: Particle[] = [];
  time = 0;
  dayClock = 0.08;
  dayCycle = true;
  private light = 1;
  private cam: Camera = { x: WORLD.W / 2, y: WORLD.HORIZON - 80, zoom: 0.6 };
  private target: Camera = { ...this.cam };
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private vw = 800;
  private vh = 600;
  private raf = 0;
  private last = 0;
  private ruleTimer = 0;
  private saveTimer = 0;
  private dirty = false;
  private ro: ResizeObserver;
  private destroyed = false;

  // interaction state
  selectedId: string | null = null;
  private hoverId: string | null = null;
  private pointers = new Map<number, PointerInfo>();
  private drag: { id: string; dx: number; dy: number; moved: boolean } | null = null;
  private pan: { moved: boolean } | null = null;
  private pinch: { dist: number; zoom: number; wx: number; wy: number } | null = null;
  private combineTarget: { id: string; since: number } | null = null;
  private external: { itemId: string; wx: number; wy: number } | null = null;
  private overTrash = false;

  constructor(
    canvas: HTMLCanvasElement,
    private opts: EngineOptions,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.bindInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unbindInput();
    this.flushSave();
  }

  // ------------------------------------------------------------------ Sim API
  item(o: WorldObject) {
    return this.opts.getItem(o.itemId);
  }
  arch(o: WorldObject): Archetype {
    const it = this.item(o);
    return it ? archetypeFor(it) : archetypeFor(FALLBACK_ITEM);
  }
  has(o: WorldObject, t: Trait) {
    return !!this.item(o)?.traits.includes(t);
  }
  emit(x: number, y: number, kind: Particle["kind"], count: number, color = "#ffffff") {
    for (let i = 0; i < count && this.particles.length < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === "puff" ? 20 + Math.random() * 30 : kind === "spark" || kind === "star" ? 80 + Math.random() * 160 : 30 + Math.random() * 40;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * sp * (kind === "puff" ? 0.4 : 1),
        vy: kind === "puff" || kind === "ember" || kind === "heart" ? -Math.abs(Math.sin(a) * sp) - 20 : Math.sin(a) * sp,
        life: 0,
        max: kind === "puff" ? 1.6 + Math.random() : kind === "heart" ? 1.4 : 0.9 + Math.random() * 0.5,
        size: kind === "puff" ? 10 + Math.random() * 12 : kind === "heart" ? 16 : 3 + Math.random() * 3,
        color,
        kind,
        gravity: kind === "spark" || kind === "star" ? 160 : kind === "drop" ? 400 : 0,
      });
    }
  }
  ignite(o: WorldObject) {
    if (o.state.charred || (o.state.burning ?? 0) > 0) return;
    o.state.burning = 9 + Math.random() * 5;
    this.emit(o.x, o.y - 30, "ember", 6, "#ffb02e");
    this.sound("ignite");
    this.dirty = true;
  }
  remove(o: WorldObject) {
    this.removeById(o.id);
  }
  transform(o: WorldObject, withItemId: string) {
    if (o.state.pending) return;
    o.state.pending = true;
    this.opts
      .onCombine(o.itemId, withItemId)
      .then((resultId) => {
        if (!this.byId.has(o.id)) return;
        if (resultId) {
          this.removeById(o.id);
          this.spawn(resultId, o.x, o.y, { burst: true });
        } else {
          o.state.pending = false;
          o.state.growth = 0;
        }
      })
      .catch(() => {
        o.state.pending = false;
      });
  }
  sound(name: string) {
    this.opts.onSound?.(name);
  }

  // ------------------------------------------------------------------ public API
  spawn(itemId: string, x?: number, y?: number, opts: { burst?: boolean; select?: boolean } = {}): string | null {
    const item = this.opts.getItem(itemId);
    if (!item) return null;
    const arch = archetypeFor(item);
    let px = x ?? this.cam.x + (Math.random() - 0.5) * 200;
    let py = y;
    if (py === undefined) {
      const [y0, y1] = layerBand(arch.layer);
      py = arch.layer === "ground" || arch.layer === "flat" ? Math.min(y1, Math.max(y0, this.cam.y + 200)) : y0 + (y1 - y0) * 0.35;
    }
    [px, py] = clampToLayer(arch.layer, px, py);
    const o: WorldObject = {
      id: Math.random().toString(36).slice(2, 10),
      itemId,
      x: px,
      y: py,
      dir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.floor(Math.random() * 1e6),
      born: this.time,
      state: {},
    };
    this.add(o);
    if (opts.burst) {
      this.emit(px, py - arch.h * 0.4, "star", 18, item.color);
      this.emit(px, py - arch.h * 0.4, "spark", 10, "#fff6b0");
    } else {
      this.emit(px, py, "puff", 5, "#ffffff");
    }
    this.sound("place");
    if (opts.select) this.select(o.id);
    return o.id;
  }

  duplicate(id: string): string | null {
    const o = this.byId.get(id);
    if (!o) return null;
    const arch = this.arch(o);
    const nid = this.spawn(o.itemId, o.x + Math.max(40, arch.w * 0.6), o.y + (arch.layer === "ground" ? 20 : 0));
    if (nid) this.select(nid);
    return nid;
  }

  deleteObject(id: string) {
    const o = this.byId.get(id);
    if (!o) return;
    this.emit(o.x, o.y - 20, "puff", 8, "#ffffff");
    this.removeById(id);
    this.sound("delete");
  }

  select(id: string | null) {
    this.selectedId = id;
    this.opts.onSelect(id);
  }

  getObject(id: string) {
    return this.byId.get(id);
  }

  clear() {
    this.objects = [];
    this.byId.clear();
    this.particles = [];
    this.select(null);
    this.dirty = true;
    this.opts.onCountChange?.(0);
  }

  resetCamera() {
    this.target = this.defaultCamera();
  }

  zoomBy(f: number) {
    this.target.zoom = this.clampZoom(this.target.zoom * f);
  }

  load(saved: SavedWorld | null) {
    this.objects = [];
    this.byId.clear();
    if (saved && saved.v === 1) {
      for (const s of saved.objects) {
        if (!this.opts.getItem(s.itemId)) continue;
        const st = { ...(s.state ?? {}) };
        delete st.pending;
        delete st.intent;
        delete st.targetId;
        delete st.riderId;
        delete st.riderItemId;
        delete st.occupants;
        st.hidden = false;
        this.add({ ...s, state: st, born: -10 });
      }
      this.time = saved.time || 0;
      this.dayClock = saved.dayClock ?? 0.08;
      if (saved.camera) {
        this.cam = { ...saved.camera, zoom: this.clampZoom(saved.camera.zoom) };
        this.target = { ...this.cam };
      }
    } else {
      this.cam = this.defaultCamera();
      this.target = { ...this.cam };
    }
    this.opts.onCountChange?.(this.objects.length);
  }

  serialize(): SavedWorld {
    return {
      v: 1,
      objects: this.objects.map((o) => ({ id: o.id, itemId: o.itemId, x: o.x, y: o.y, dir: o.dir, seed: o.seed, state: o.state })),
      camera: { ...this.target },
      time: this.time,
      dayClock: this.dayClock,
    };
  }

  flushSave() {
    this.opts.onSave(this.serialize());
    this.dirty = false;
  }

  // ---- drag from the inventory/bench (DOM) into the world
  externalDragMove(clientX: number, clientY: number, itemId: string): boolean {
    const r = this.canvas.getBoundingClientRect();
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    if (!inside) {
      this.external = null;
      this.combineTarget = null;
      return false;
    }
    const [wx, wy] = this.toWorld(clientX - r.left, clientY - r.top);
    this.external = { itemId, wx, wy };
    this.updateCombineTarget(wx, wy, null);
    return true;
  }

  externalDragEnd() {
    this.external = null;
    this.combineTarget = null;
  }

  /** Drop an item from outside. Returns true if the world accepted it. */
  externalDrop(clientX: number, clientY: number, itemId: string): boolean {
    const r = this.canvas.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
      this.externalDragEnd();
      return false;
    }
    const [wx, wy] = this.toWorld(clientX - r.left, clientY - r.top);
    const target = this.armedTarget();
    this.externalDragEnd();
    if (target) {
      this.combineInto(target, itemId, null);
    } else {
      const item = this.opts.getItem(itemId);
      if (!item) return false;
      const arch = archetypeFor(item);
      // Drop point is where the pointer is; for foot-anchored objects put the feet there.
      this.spawn(itemId, wx, arch.anchor === "foot" ? wy + Math.min(arch.h * 0.3, 30) : wy, { select: true });
    }
    return true;
  }

  // ------------------------------------------------------------------ internals
  private add(o: WorldObject) {
    this.objects.push(o);
    this.byId.set(o.id, o);
    this.dirty = true;
    this.opts.onCountChange?.(this.objects.length);
  }

  private removeById(id: string) {
    const o = this.byId.get(id);
    if (!o) return;
    this.byId.delete(id);
    this.objects = this.objects.filter((x) => x.id !== id);
    // release anything tied to it
    for (const other of this.objects) {
      if (other.state.targetId === id) {
        other.state.intent = undefined;
        other.state.targetId = undefined;
      }
      if (other.state.insideId === id) {
        other.state.hidden = false;
        other.state.insideId = undefined;
      }
    }
    if (o.state.riderId) {
      const rider = this.byId.get(o.state.riderId);
      if (rider) {
        rider.state.hidden = false;
        rider.state.insideId = undefined;
      }
    }
    if (this.selectedId === id) this.select(null);
    this.dirty = true;
    this.opts.onCountChange?.(this.objects.length);
  }

  private combineInto(target: WorldObject, itemId: string, consumed: WorldObject | null) {
    target.state.pending = true;
    if (consumed) consumed.state.pending = true;
    this.sound("combine");
    this.opts
      .onCombine(itemId, target.itemId)
      .then((resultId) => {
        if (resultId && this.byId.has(target.id)) {
          const { x, y } = target;
          this.removeById(target.id);
          if (consumed) this.removeById(consumed.id);
          this.spawn(resultId, x, y, { burst: true, select: true });
        } else {
          target.state.pending = false;
          if (consumed) consumed.state.pending = false;
        }
      })
      .catch(() => {
        target.state.pending = false;
        if (consumed) consumed.state.pending = false;
      });
  }

  private defaultCamera(): Camera {
    const zoom = this.clampZoom(this.vw / 1250);
    return { x: WORLD.W / 2, y: WORLD.HORIZON - this.vh * 0.08 / zoom, zoom };
  }

  private clampZoom(z: number) {
    const min = Math.max(0.18, Math.min(this.vw / (WORLD.W + 600), this.vh / (WORLD.H + 200)));
    return Math.max(min, Math.min(2.6, z));
  }

  private clampCam(c: Camera) {
    const halfW = this.vw / 2 / c.zoom;
    const halfH = this.vh / 2 / c.zoom;
    c.x = halfW * 2 >= WORLD.W + 400 ? WORLD.W / 2 : Math.max(halfW - 200, Math.min(WORLD.W + 200 - halfW, c.x));
    c.y = halfH * 2 >= WORLD.H + 200 ? WORLD.H / 2 : Math.max(halfH - 100, Math.min(WORLD.H + 100 - halfH, c.y));
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.target.zoom = this.clampZoom(this.target.zoom);
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.vw / 2) / this.cam.zoom + this.cam.x, (sy - this.vh / 2) / this.cam.zoom + this.cam.y];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cam.x) * this.cam.zoom + this.vw / 2, (wy - this.cam.y) * this.cam.zoom + this.vh / 2];
  }

  /** Screen-space (client) rect of an object, for anchoring UI. */
  screenRectOf(id: string): { x: number; y: number; w: number; h: number } | null {
    const o = this.byId.get(id);
    if (!o) return null;
    const b = boundsOf(this.arch(o), o.x, o.y);
    const [x, y] = this.toScreen(b.x, b.y);
    return { x, y, w: b.w * this.cam.zoom, h: b.h * this.cam.zoom };
  }

  private sorted(): WorldObject[] {
    return [...this.objects].sort((a, b) => {
      const la = LAYER_ORDER[this.arch(a).layer];
      const lb = LAYER_ORDER[this.arch(b).layer];
      return la - lb || a.y - b.y;
    });
  }

  private hitTest(wx: number, wy: number, exclude: string | null): WorldObject | null {
    const list = this.sorted();
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.id === exclude || o.state.hidden) continue;
      const b = boundsOf(this.arch(o), o.x, o.y);
      const pad = 6 / this.cam.zoom;
      if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) return o;
    }
    return null;
  }

  private updateCombineTarget(wx: number, wy: number, exclude: string | null) {
    const hit = this.hitTest(wx, wy, exclude);
    if (!hit || hit.state.pending) {
      this.combineTarget = null;
      return;
    }
    if (this.combineTarget?.id !== hit.id) this.combineTarget = { id: hit.id, since: this.time };
  }

  private armedTarget(): WorldObject | null {
    if (!this.combineTarget) return null;
    if (this.time - this.combineTarget.since < DWELL) return null;
    return this.byId.get(this.combineTarget.id) ?? null;
  }

  // ------------------------------------------------------------------ input
  private handlers: Array<[EventTarget, string, EventListener, AddEventListenerOptions?]> = [];

  private on<K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, o?: AddEventListenerOptions) {
    t.addEventListener(type, fn as EventListener, o);
    this.handlers.push([t, type, fn as EventListener, o]);
  }

  private bindInput() {
    const c = this.canvas;
    this.on(c, "pointerdown", (e: PointerEvent) => this.onDown(e));
    this.on(c, "pointermove", (e: PointerEvent) => this.onMove(e));
    this.on(c, "pointerup", (e: PointerEvent) => this.onUp(e));
    this.on(c, "pointercancel", (e: PointerEvent) => this.onUp(e, true));
    this.on(c, "pointerleave", () => {
      this.hoverId = null;
    });
    this.on(c, "wheel", (e: WheelEvent) => this.onWheel(e), { passive: false });
    this.on(c, "contextmenu", (e: Event) => e.preventDefault());
    this.on(window, "keydown", (e: KeyboardEvent) => this.onKey(e));
    this.on(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flushSave();
    });
    this.on(window, "pagehide", () => this.flushSave());
  }

  private unbindInput() {
    for (const [t, type, fn, o] of this.handlers) t.removeEventListener(type, fn, o);
    this.handlers = [];
  }

  private local(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown(e: PointerEvent) {
    const [sx, sy] = this.local(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: sx, y: sy, startX: sx, startY: sy, type: e.pointerType });
    if (this.pointers.size === 2) {
      // Start pinch: cancel any single-pointer gesture.
      this.cancelDrag();
      this.pan = null;
      const [a, b] = [...this.pointers.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const [wx, wy] = this.toWorld(mx, my);
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom, wx, wy };
      return;
    }
    if (this.pointers.size > 2) return;
    const [wx, wy] = this.toWorld(sx, sy);
    const hit = this.hitTest(wx, wy, null);
    if (hit && !hit.state.pending) {
      this.drag = { id: hit.id, dx: hit.x - wx, dy: hit.y - wy, moved: false };
    } else {
      this.pan = { moved: false };
    }
  }

  private onMove(e: PointerEvent) {
    const [sx, sy] = this.local(e);
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") {
        const [wx, wy] = this.toWorld(sx, sy);
        this.hoverId = this.hitTest(wx, wy, null)?.id ?? null;
        this.canvas.style.cursor = this.hoverId ? "grab" : "default";
      }
      return;
    }
    const dxs = sx - p.x;
    const dys = sy - p.y;
    p.x = sx;
    p.y = sy;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = this.clampZoom(this.pinch.zoom * (dist / Math.max(10, this.pinch.dist)));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // keep the pinch anchor under the fingers
      this.cam.zoom = this.target.zoom = zoom;
      this.cam.x = this.target.x = this.pinch.wx - (mx - this.vw / 2) / zoom;
      this.cam.y = this.target.y = this.pinch.wy - (my - this.vh / 2) / zoom;
      this.clampCam(this.target);
      this.cam.x = this.target.x;
      this.cam.y = this.target.y;
      return;
    }
    const far = Math.hypot(sx - p.startX, sy - p.startY) > (p.type === "touch" ? 8 : 4);
    if (this.drag) {
      const o = this.byId.get(this.drag.id);
      if (!o) {
        this.drag = null;
        return;
      }
      if (!this.drag.moved && !far) return;
      if (!this.drag.moved) {
        this.drag.moved = true;
        this.select(o.id);
        this.opts.onDragObject?.(true, false);
        this.canvas.style.cursor = "grabbing";
      }
      const [wx, wy] = this.toWorld(sx, sy);
      const arch = this.arch(o);
      const [nx, ny] = clampToLayer(arch.layer, wx + this.drag.dx, wy + this.drag.dy);
      if (nx !== o.x) o.dir = nx > o.x ? 1 : -1;
      o.x = nx;
      o.y = ny;
      this.clearIntent(o);
      o.state.goalX = o.state.goalY = undefined;
      this.updateCombineTarget(wx, wy, o.id);
      const trash = this.opts.getTrashRect?.();
      const over = !!trash && e.clientX >= trash.left && e.clientX <= trash.right && e.clientY >= trash.top && e.clientY <= trash.bottom;
      if (over !== this.overTrash) {
        this.overTrash = over;
        this.opts.onDragObject?.(true, over);
      }
      // auto-pan near the edges
      const edge = 36;
      const ex = sx < edge ? -1 : sx > this.vw - edge ? 1 : 0;
      const ey = sy < edge ? -1 : sy > this.vh - edge ? 1 : 0;
      this.target.x += (ex * 12) / this.cam.zoom;
      this.target.y += (ey * 12) / this.cam.zoom;
      this.dirty = true;
      return;
    }
    if (this.pan) {
      if (!this.pan.moved && !far) return;
      this.pan.moved = true;
      this.canvas.style.cursor = "grabbing";
      this.target.x -= dxs / this.cam.zoom;
      this.target.y -= dys / this.cam.zoom;
      this.clampCam(this.target);
      this.cam.x = this.target.x;
      this.cam.y = this.target.y;
    }
  }

  private cancelDrag() {
    if (this.drag?.moved) this.opts.onDragObject?.(false, false);
    this.drag = null;
    this.combineTarget = null;
    this.overTrash = false;
  }

  private onUp(e: PointerEvent, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      // After a pinch the remaining finger should not start a pan jump.
      for (const q of this.pointers.values()) {
        q.startX = q.x;
        q.startY = q.y;
      }
      if (this.pointers.size === 1) this.pan = { moved: true };
      return;
    }
    this.canvas.style.cursor = this.hoverId ? "grab" : "default";
    if (this.drag) {
      const o = this.byId.get(this.drag.id);
      const moved = this.drag.moved;
      const target = this.armedTarget();
      const overTrash = this.overTrash;
      this.cancelDrag();
      if (!o) return;
      if (!moved) {
        if (!cancelled) {
          this.select(o.id);
          this.poke(o);
        }
        return;
      }
      if (cancelled) return;
      if (overTrash) {
        this.deleteObject(o.id);
      } else if (target) {
        this.combineInto(target, o.itemId, o);
      } else {
        this.emit(o.x, o.y, "puff", 3, "#ffffff");
        this.sound("place");
      }
      this.dirty = true;
      return;
    }
    if (this.pan) {
      if (!this.pan.moved && !cancelled && p) this.select(null);
      this.pan = null;
    }
  }

  /** Clicking an object makes it react a little. */
  private poke(o: WorldObject) {
    const arch = this.arch(o);
    this.emit(o.x, o.y - arch.h * 0.6, "star", 4, this.item(o)?.color ?? "#fff");
    if (arch.movement === "wander") {
      o.state.pause = 0;
      o.state.goalX = o.x + (Math.random() - 0.5) * 200;
      o.state.goalY = o.y + (Math.random() - 0.5) * 60;
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const [sx, sy] = this.local(e);
    const isZoom = e.ctrlKey || e.metaKey || (e.deltaMode === 1) || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0 && Number.isInteger(e.deltaY));
    if (isZoom) {
      const [wx, wy] = this.toWorld(sx, sy);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoom = this.clampZoom(this.target.zoom * factor);
      this.target.zoom = zoom;
      this.target.x = wx - (sx - this.vw / 2) / zoom;
      this.target.y = wy - (sy - this.vh / 2) / zoom;
    } else {
      this.target.x += e.deltaX / this.cam.zoom;
      this.target.y += e.deltaY / this.cam.zoom;
    }
    this.clampCam(this.target);
  }

  private onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!this.selectedId) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteObject(this.selectedId);
    } else if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.duplicate(this.selectedId);
    } else if (e.key === "Escape") {
      this.select(null);
    }
  }

  // ------------------------------------------------------------------ simulation
  private frame = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.time += dt;
    if (this.dayCycle) this.dayClock = (this.dayClock + dt / DAY_LENGTH) % 1;

    // smooth camera
    this.clampCam(this.target);
    const k = 1 - Math.pow(0.0005, dt);
    this.cam.x += (this.target.x - this.cam.x) * k;
    this.cam.y += (this.target.y - this.cam.y) * k;
    this.cam.zoom += (this.target.zoom - this.cam.zoom) * k;

    for (const o of this.objects) this.updateObject(o, dt);

    this.ruleTimer += dt;
    if (this.ruleTimer >= 0.25) {
      this.runRules(this.ruleTimer);
      this.ruleTimer = 0;
    }

    // particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 0) * dt;
      if (p.kind === "puff") p.vx *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    // lighting
    const target = this.targetLight();
    this.light += (target - this.light) * Math.min(1, dt * 1.5);

    this.saveTimer += dt;
    if (this.saveTimer > 2.5) {
      this.saveTimer = 0;
      if (this.dirty) this.flushSave();
    }
  }

  private targetLight(): number {
    let base = this.dayCycle ? Math.max(0, Math.min(1, 0.5 + 0.75 * Math.cos(this.dayClock * Math.PI * 2))) : 1;
    let suns = 0;
    let nights = 0;
    for (const o of this.objects) {
      if (o.state.hidden) continue;
      const it = this.item(o);
      if (!it) continue;
      if (it.worldType === "celestial" && it.traits.includes("light") && it.traits.includes("hot")) suns++;
      if (it.traits.includes("night")) nights++;
    }
    if (nights > suns) base = Math.min(base, 0.12);
    else if (suns > 0) base = Math.max(base, 0.95);
    return base;
  }

  private updateObject(o: WorldObject, dt: number) {
    const st = o.state;
    const item = this.item(o);
    if (!item) return;
    const arch = archetypeFor(item);
    if (st.burning !== undefined && st.burning > 0) {
      st.burning -= dt;
      if (Math.random() < dt * 6) this.emit(o.x + (Math.random() - 0.5) * arch.w * 0.5, o.y - arch.h * 0.8, "ember", 1, "#ffb02e");
      if (Math.random() < dt * 2) this.emit(o.x, o.y - arch.h, "puff", 1, "#77777f");
      if (st.burning <= 0) {
        st.burning = 0;
        if (item.worldType === "tree" || item.worldType === "plant" || item.worldType === "building") st.charred = true;
        this.dirty = true;
      }
    }
    if (st.raining !== undefined && st.raining > 0) st.raining = Math.max(0, st.raining - dt);
    if (st.frozen !== undefined && st.frozen > 0) st.frozen = Math.max(0, st.frozen - dt);
    if (st.fleeing !== undefined && st.fleeing > 0) st.fleeing -= dt;
    if (st.doused !== undefined && st.doused > 0) st.doused = Math.max(0, st.doused - dt * 0.2);

    // Lightning from electric weather.
    if (item.worldType === "weather" && item.traits.includes("electric")) {
      if (st.boltAt === undefined || this.time - st.boltAt > 4 + rand(o.seed + Math.floor(this.time)) * 6) {
        st.boltAt = this.time;
        this.sound("zap");
        const victims = this.objects.filter(
          (v) => v !== o && Math.abs(v.x - o.x) < arch.w * 0.45 && this.has(v, "flammable") && !v.state.hidden,
        );
        if (victims.length) this.ignite(victims[Math.floor(Math.random() * victims.length)]);
      }
    }

    // Hidden creatures (inside a building or vehicle) come out later.
    if (st.hidden) {
      if (st.exitAt !== undefined && this.time >= st.exitAt) this.exitShelter(o);
      else if (st.insideId) {
        const host = this.byId.get(st.insideId);
        if (host) {
          o.x = host.x;
          o.y = host.y + 4;
        } else this.exitShelter(o);
      }
      return;
    }
    if (st.pending || this.drag?.id === o.id) return;

    switch (arch.movement) {
      case "wander":
        this.wander(o, arch, item, dt);
        break;
      case "fly":
        this.fly(o, arch, dt);
        break;
      case "drive":
        this.driveAlong(o, arch, dt, 0, WORLD.W, st.riderItemId ? 1.8 : 1);
        break;
      case "sail":
        this.sail(o, arch, dt);
        break;
      case "rails":
        this.rails(o, arch, dt);
        break;
      case "drift": {
        o.x += arch.speed * o.dir * dt * (0.6 + rand(o.seed) * 0.8);
        if (o.x > WORLD.W + 150) o.x = -150;
        if (o.x < -150) o.x = WORLD.W + 150;
        break;
      }
      default:
        break;
    }
  }

  private wander(o: WorldObject, arch: Archetype, item: ItemDef, dt: number) {
    const st = o.state;
    if (st.goalX === undefined || st.goalY === undefined) {
      if ((st.pause ?? 0) > 0) {
        st.pause = (st.pause ?? 0) - dt;
        return;
      }
      // Swimmers prefer water if any exists.
      let gx = o.x + (Math.random() - 0.5) * 420;
      let gy = o.y + (Math.random() - 0.5) * 140;
      if (item.traits.includes("swimming")) {
        const pools = this.objects.filter((w) => this.item(w)?.worldType === "water");
        if (pools.length) {
          const pool = pools.reduce((a, b) => (Math.abs(a.x - o.x) < Math.abs(b.x - o.x) ? a : b));
          const pa = this.arch(pool);
          gx = pool.x + (Math.random() - 0.5) * pa.w * 0.6;
          gy = pool.y + (Math.random() - 0.5) * pa.h * 0.4 + 6;
        }
      }
      [st.goalX, st.goalY] = clampToLayer(arch.layer, gx, gy);
    }
    const dx = st.goalX - o.x;
    const dy = st.goalY - o.y;
    const d = Math.hypot(dx, dy);
    const speed = arch.speed * ((st.fleeing ?? 0) > 0 ? 2.4 : 1) * (st.intent ? 1.3 : 1);
    if (d < 6) {
      st.goalX = st.goalY = undefined;
      if (st.intent) this.completeIntent(o);
      else st.pause = 1 + Math.random() * 3;
      return;
    }
    // Track a moving target.
    if (st.intent && st.targetId) {
      const t = this.byId.get(st.targetId);
      if (!t || t.state.hidden || t.state.pending) {
        this.clearIntent(o);
        st.goalX = st.goalY = undefined;
        return;
      }
      st.goalX = t.x;
      st.goalY = Math.max(layerBand("ground")[0], t.y + 2);
    }
    const step = Math.min(d, speed * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
    if (Math.abs(dx) > 1) o.dir = dx > 0 ? 1 : -1;
  }

  private clearIntent(o: WorldObject) {
    const t = o.state.targetId ? this.byId.get(o.state.targetId) : undefined;
    if (t && o.state.intent === "ride" && t.state.riderId === o.id && !t.state.riderItemId) t.state.riderId = undefined;
    o.state.intent = undefined;
    o.state.targetId = undefined;
  }

  private completeIntent(o: WorldObject) {
    const st = o.state;
    const t = st.targetId ? this.byId.get(st.targetId) : undefined;
    const intent = st.intent;
    st.intent = undefined;
    st.targetId = undefined;
    if (!t) return;
    if (intent === "enter") {
      st.hidden = true;
      st.insideId = t.id;
      st.exitAt = this.time + 6 + Math.random() * 8;
      t.state.occupants = (t.state.occupants ?? 0) + 1;
      this.emit(t.x, t.y - 20, "heart", 1, "#ff6b8a");
    } else if (intent === "ride") {
      if (t.state.riderId && t.state.riderId !== o.id) return;
      st.hidden = true;
      st.insideId = t.id;
      st.exitAt = this.time + 10 + Math.random() * 10;
      t.state.riderId = o.id;
      t.state.riderItemId = o.itemId;
      this.sound("pop");
    } else if (intent === "douse") {
      this.emit(t.x, t.y - 30, "drop", 10, "#8fc8ff");
      this.emit(t.x, t.y - 30, "puff", 6, "#e6edf3");
      this.sound("splash");
      if ((t.state.burning ?? 0) > 0) t.state.burning = 0;
      else if (this.item(t)?.worldType === "fire") this.removeById(t.id);
      st.pause = 0.6;
    } else if (intent === "eat") {
      this.emit(t.x, t.y - 20, "heart", 1, "#ff6b8a");
      this.sound("munch");
      this.removeById(t.id);
      st.heart = this.time;
    }
  }

  private exitShelter(o: WorldObject) {
    const st = o.state;
    const host = st.insideId ? this.byId.get(st.insideId) : undefined;
    if (host) {
      if (host.state.riderId === o.id) {
        host.state.riderId = undefined;
        host.state.riderItemId = undefined;
      }
      if (host.state.occupants) host.state.occupants = Math.max(0, host.state.occupants - 1);
      o.x = host.x + (Math.random() < 0.5 ? -1 : 1) * (this.arch(host).w * 0.5 + 10);
      o.y = Math.max(layerBand("ground")[0], host.y + 6);
    }
    st.hidden = false;
    st.insideId = undefined;
    st.exitAt = undefined;
    st.pause = 2;
    this.emit(o.x, o.y - 10, "puff", 2, "#ffffff");
  }

  private fly(o: WorldObject, arch: Archetype, dt: number) {
    const st = o.state;
    if (st.goalX === undefined || st.goalY === undefined) {
      const [y0, y1] = layerBand(arch.layer);
      st.goalX = Math.max(80, Math.min(WORLD.W - 80, o.x + (Math.random() - 0.5) * 900));
      st.goalY = y0 + Math.random() * (y1 - y0) * 0.7;
    }
    const dx = st.goalX - o.x;
    const dy = st.goalY - o.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) {
      st.goalX = st.goalY = undefined;
      return;
    }
    const step = Math.min(d, arch.speed * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step + Math.sin(this.time * 3 + o.seed) * 0.4;
    if (Math.abs(dx) > 2) o.dir = dx > 0 ? 1 : -1;
  }

  private driveAlong(o: WorldObject, arch: Archetype, dt: number, minX: number, maxX: number, boost = 1) {
    o.x += o.dir * arch.speed * boost * dt;
    if (o.x > maxX - arch.w / 2) {
      o.x = maxX - arch.w / 2;
      o.dir = -1;
    } else if (o.x < minX + arch.w / 2) {
      o.x = minX + arch.w / 2;
      o.dir = 1;
    }
    if (Math.random() < dt * 3) this.emit(o.x - o.dir * arch.w * 0.45, o.y - 6, "puff", 1, "#d8cdb8");
  }

  private sail(o: WorldObject, arch: Archetype, dt: number) {
    const pool = this.objects.find((w) => {
      if (this.item(w)?.worldType !== "water") return false;
      const a = this.arch(w);
      return Math.abs(w.x - o.x) < a.w / 2 && Math.abs(w.y - o.y) < a.h * 0.6 + 20;
    });
    if (!pool) return; // beached
    const pa = this.arch(pool);
    const minX = pool.x - pa.w * 0.42;
    const maxX = pool.x + pa.w * 0.42;
    o.x += o.dir * arch.speed * dt;
    if (o.x > maxX) o.dir = -1;
    if (o.x < minX) o.dir = 1;
  }

  private rails(o: WorldObject, arch: Archetype, dt: number) {
    const tracks = this.objects.filter((t) => this.has(t, "rail") && Math.abs(t.y - o.y) < 90);
    if (!tracks.length) {
      if (Math.random() < dt * 0.3) this.emit(o.x, o.y - arch.h, "puff", 1, "#b9b9c0");
      return;
    }
    // Find the connected span of track under/near the train.
    let minX = Infinity;
    let maxX = -Infinity;
    let ty = 0;
    for (const t of tracks) {
      const ta = this.arch(t);
      minX = Math.min(minX, t.x - ta.w / 2);
      maxX = Math.max(maxX, t.x + ta.w / 2);
      ty += t.y;
    }
    ty /= tracks.length;
    o.y += (ty + 4 - o.y) * Math.min(1, dt * 4);
    if (o.x < minX - 40 || o.x > maxX + 40) {
      o.x += Math.sign((minX + maxX) / 2 - o.x) * arch.speed * 0.5 * dt;
      return;
    }
    this.driveAlong(o, arch, dt, minX, maxX, o.state.riderItemId ? 1.5 : 1);
    if (Math.random() < dt * 5) this.emit(o.x + o.dir * arch.w * 0.3, o.y - arch.h * 0.95, "puff", 1, "#e9e9ee");
  }

  private runRules(dt: number) {
    const objs = this.objects;
    if (objs.length < 2) return;
    for (const rule of INTERACTION_RULES) {
      const as: WorldObject[] = [];
      const bs: WorldObject[] = [];
      for (const o of objs) {
        const it = this.item(o);
        if (!it) continue;
        if (rule.a(o, it, this)) as.push(o);
        if (rule.b(o, it, this)) bs.push(o);
      }
      if (!as.length || !bs.length) continue;
      const p = 1 - Math.exp(-rule.chance * dt);
      for (const a of as) {
        const aa = this.arch(a);
        const aSky = aa.layer === "weather" || aa.layer === "sky" || aa.layer === "air";
        for (const b of bs) {
          if (a === b) continue;
          let inRange: boolean;
          if (rule.mode === "below" || aSky) {
            inRange = Math.abs(b.x - a.x) < aa.w * 0.5 + rule.range && b.y > a.y;
          } else {
            const dx = b.x - a.x;
            const dy = (b.y - a.y) * 1.6;
            inRange = dx * dx + dy * dy < rule.range * rule.range;
          }
          if (inRange && Math.random() < p) {
            rule.effect(this, a, b);
            this.dirty = true;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ rendering
  private render() {
    const ctx = this.ctx;
    const { dpr, cam, vw, vh } = this;
    const dark = 1 - this.light;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (vw / 2 - cam.x * cam.zoom), dpr * (vh / 2 - cam.y * cam.zoom));

    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(vw, vh);
    this.drawBackdrop(ctx, x0, y0, x1, y1, dark);

    const list = this.sorted();
    const pxScale = dpr * cam.zoom;
    const hasSun = list.some((o) => {
      const it = this.item(o);
      return it?.worldType === "celestial" && it.traits.includes("light") && it.traits.includes("hot");
    });

    for (const o of list) {
      if (o.state.hidden) continue;
      const item = this.item(o);
      if (!item) continue;
      const arch = archetypeFor(item);
      const b = boundsOf(arch, o.x, o.y);
      if (b.x > x1 + 200 || b.x + b.w < x0 - 200 || b.y > y1 + 300 || b.y + b.h < y0 - 300) continue;
      const age = this.time - o.born;
      const pop = age < 0.35 ? 0.6 + 0.4 * easeOutBack(age / 0.35) : 1;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(b.scale * pop, b.scale * pop);
      if (o.state.pending) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.time * 8);
      const moving = o.state.goalX !== undefined || arch.movement === "drive" || arch.movement === "rails" || arch.movement === "sail";
      try {
        if (o.state.charred) ctx.filter = "grayscale(1) brightness(0.45)";
        RENDERERS[item.worldType]({
          ctx,
          o,
          item,
          arch,
          t: this.time,
          dark,
          px: pxScale * b.scale,
          moving,
          has: (t) => item.traits.includes(t as Trait),
        });
      } finally {
        ctx.filter = "none";
      }
      if ((o.state.burning ?? 0) > 0) drawBurning(ctx, arch, this.time, o.seed);
      ctx.restore();
    }

    this.drawParticles(ctx);

    // Night overlay and light sources.
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(10,14,48,${dark * 0.42})`;
      ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
      ctx.globalCompositeOperation = "lighter";
      for (const o of list) {
        if (o.state.hidden) continue;
        const item = this.item(o);
        if (!item) continue;
        const glow = (o.state.burning ?? 0) > 0 || item.worldType === "fire" || (item.traits.includes("light") && item.worldType !== "celestial") || (item.worldType === "building" && !o.state.charred);
        if (!glow) continue;
        const arch = archetypeFor(item);
        const b = boundsOf(arch, o.x, o.y);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h * 0.5;
        const r = Math.max(60, Math.max(b.w, b.h) * (item.worldType === "building" ? 0.8 : 1.4));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const strength = dark * (item.worldType === "building" ? 0.22 : 0.45);
        g.addColorStop(0, `rgba(255,190,90,${strength})`);
        g.addColorStop(1, "rgba(255,190,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (hasSun) {
      ctx.fillStyle = "rgba(255,210,130,0.07)";
      ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
    }

    this.drawOverlays(ctx);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, dark: number) {
    const H = WORLD.HORIZON;
    // Sky.
    const top = mix("#5aaaf0", "#070b26", dark);
    const bottom = dark < 0.5 ? mix("#cdeaff", "#f6b27a", dark * 2) : mix("#f6b27a", "#27315c", (dark - 0.5) * 2);
    const sky = ctx.createLinearGradient(0, Math.min(y0, 0), 0, H);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, H - y0 + 10);

    // Stars at night.
    if (dark > 0.35) {
      const a = Math.min(1, (dark - 0.35) / 0.4);
      ctx.fillStyle = "#ffffff";
      const step = 90;
      for (let gx = Math.floor(x0 / step) * step; gx < x1; gx += step) {
        for (let gy = Math.max(0, Math.floor(y0 / step) * step); gy < H - 150; gy += step) {
          const h = hashString(gx + ":" + gy);
          if (h % 3) continue;
          const sx = gx + (h % 89);
          const sy = gy + ((h >>> 8) % 89);
          ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.5 + h)));
          const s = (1 + (h % 3) * 0.7) / Math.min(1, this.cam.zoom);
          ctx.fillRect(sx, sy, s, s);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Far hills with parallax.
    const hills: Array<[number, string, number, number]> = [
      [0.45, mix("#a8d4c0", "#1d2747", dark), 120, 0.0021],
      [0.7, mix("#86c48e", "#1a2a3a", dark), 80, 0.0034],
    ];
    for (const [par, color, amp, freq] of hills) {
      const off = this.cam.x * (1 - par);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x0 - 20, H + 2);
      for (let x = x0 - 20; x <= x1 + 40; x += 30) {
        const u = x - off;
        const yy = H - amp * (0.55 + 0.3 * Math.sin(u * freq) + 0.15 * Math.sin(u * freq * 2.7 + 1.3));
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(x1 + 40, H + 2);
      ctx.closePath();
      ctx.fill();
    }

    // Ground.
    const ground = ctx.createLinearGradient(0, H, 0, WORLD.H);
    ground.addColorStop(0, "#9ad46f");
    ground.addColorStop(1, "#5aa64a");
    ctx.fillStyle = ground;
    ctx.fillRect(x0 - 10, H, x1 - x0 + 20, WORLD.H - H);
    ctx.fillStyle = "#c2e59a";
    ctx.fillRect(x0 - 10, H, x1 - x0 + 20, 4);
    // soil below the world's front edge
    ctx.fillStyle = "#8a6440";
    ctx.fillRect(x0 - 10, WORLD.H, x1 - x0 + 20, 26);
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(x0 - 10, WORLD.H + 26, x1 - x0 + 20, Math.max(0, y1 - WORLD.H));

    // Grass tufts (deterministic, only in view).
    const step = 70;
    ctx.strokeStyle = "#4f9a40";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let gx = Math.floor(x0 / step) * step; gx < x1 + step; gx += step) {
      for (let row = 0; row < 6; row++) {
        const h = hashString(gx + "g" + row);
        if (h % 3 === 0) continue;
        const tx = gx + (h % step);
        const ty = H + 30 + (((h >>> 6) % 1000) / 1000) * (WORLD.H - H - 50);
        if (ty < y0 || ty > y1 + 10) continue;
        const s = 0.6 + ((ty - H) / (WORLD.H - H)) * 0.8;
        const sway = Math.sin(this.time * 1.5 + tx * 0.01) * 2;
        ctx.beginPath();
        ctx.moveTo(tx - 4 * s, ty);
        ctx.lineTo(tx - 6 * s + sway, ty - 9 * s);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + sway, ty - 12 * s);
        ctx.moveTo(tx + 4 * s, ty);
        ctx.lineTo(tx + 6 * s + sway, ty - 8 * s);
        ctx.stroke();
        if (h % 17 === 0) {
          ctx.fillStyle = ["#ffffff", "#ffd84a", "#ff8ab0", "#b18cff"][h % 4];
          ctx.beginPath();
          ctx.arc(tx + sway, ty - 12 * s, 2.5 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const k = p.life / p.max;
      const alpha = 1 - k;
      switch (p.kind) {
        case "puff":
          ctx.fillStyle = rgba(p.color, alpha * 0.6);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
          ctx.fill();
          break;
        case "heart":
          ctx.globalAlpha = alpha;
          ctx.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("❤️", p.x, p.y);
          ctx.globalAlpha = 1;
          break;
        case "star":
          ctx.fillStyle = rgba(p.color, alpha);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 6);
          ctx.fillRect(-p.size, -p.size * 0.3, p.size * 2, p.size * 0.6);
          ctx.fillRect(-p.size * 0.3, -p.size, p.size * 0.6, p.size * 2);
          ctx.restore();
          break;
        default:
          ctx.fillStyle = rgba(p.color, alpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
      }
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D) {
    const z = this.cam.zoom;
    // Selection.
    const sel = this.selectedId ? this.byId.get(this.selectedId) : null;
    if (sel && !sel.state.hidden) {
      const b = boundsOf(this.arch(sel), sel.x, sel.y);
      const pad = 8 / z;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2.5 / z;
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.lineDashOffset = -this.time * 20 / z;
      ctx.beginPath();
      ctx.roundRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 10 / z);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Hover label (mouse).
    const hov = this.hoverId && this.hoverId !== this.selectedId && !this.drag ? this.byId.get(this.hoverId) : null;
    if (hov && !hov.state.hidden) {
      const it = this.item(hov);
      if (it) this.label(ctx, hov, it.name);
    }
    // Combine target ring.
    const ct = this.combineTarget ? this.byId.get(this.combineTarget.id) : null;
    if (ct) {
      const b = boundsOf(this.arch(ct), ct.x, ct.y);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = Math.max(b.w, b.h) * 0.6 + 10 / z;
      const prog = Math.min(1, (this.time - this.combineTarget!.since) / DWELL);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 6 / z;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = prog >= 1 ? "#ffd84a" : "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
      if (prog >= 1) {
        const it = this.item(ct);
        this.label(ctx, ct, `Combine with ${it?.name ?? ""}`, "#ffd84a");
      }
    }
    // External drag placement preview.
    if (this.external && !(ct && this.armedTarget())) {
      const it = this.opts.getItem(this.external.itemId);
      if (it) {
        const arch = archetypeFor(it);
        const [px, py] = clampToLayer(arch.layer, this.external.wx, arch.anchor === "foot" ? this.external.wy + Math.min(arch.h * 0.3, 30) : this.external.wy);
        const b = boundsOf(arch, px, py);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2 / z;
        ctx.setLineDash([6 / z, 5 / z]);
        ctx.beginPath();
        if (arch.anchor === "foot") ctx.ellipse(px, py, b.w / 2, Math.max(6, b.w * 0.12), 0, 0, Math.PI * 2);
        else ctx.roundRect(b.x, b.y, b.w, b.h, 12 / z);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private label(ctx: CanvasRenderingContext2D, o: WorldObject, text: string, color = "#ffffff") {
    const z = this.cam.zoom;
    const b = boundsOf(this.arch(o), o.x, o.y);
    const fs = 13 / z;
    ctx.font = `600 ${fs}px ui-rounded, system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const x = b.x + b.w / 2;
    const y = b.y - 14 / z;
    ctx.fillStyle = "rgba(25,30,50,0.78)";
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 8 / z, y - fs, tw + 16 / z, fs * 1.6, 8 / z);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y - fs * 0.2);
  }
}

const FALLBACK_ITEM: ItemDef = {
  id: "?",
  name: "?",
  emoji: "❔",
  category: "concept",
  description: "",
  worldType: "object",
  size: "small",
  color: "#999999",
  traits: [],
};

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
