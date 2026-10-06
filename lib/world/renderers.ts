import type { ItemDef, WorldType } from "../types";
import type { Archetype } from "./archetypes";
import { WORLD, type WorldObject } from "./types";
import { drawEmoji, isFaceEmoji, mix, rand, rgba, shade } from "./sprites";

/**
 * Procedural renderers, one per worldType. Each draws an object in local
 * coordinates where (0,0) is the anchor (feet for ground objects, center for
 * sky objects) and the archetype's w/h are the size. The engine handles
 * translation, depth scaling, selection and lighting.
 */
export interface RenderArgs {
  ctx: CanvasRenderingContext2D;
  o: WorldObject;
  item: ItemDef;
  arch: Archetype;
  t: number; // world time, seconds
  dark: number; // 0 = full day, 1 = deep night
  px: number; // device pixels per local unit (for sprite resolution)
  moving: boolean;
  has: (trait: string) => boolean;
}

type Renderer = (a: RenderArgs) => void;

const TAU = Math.PI * 2;

function shadow(ctx: CanvasRenderingContext2D, w: number, alpha = 0.18) {
  ctx.fillStyle = `rgba(20,30,20,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, Math.max(3, w * 0.12), 0, 0, TAU);
  ctx.fill();
}

function flame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, seed: number, color = "#ff7a1a") {
  const f = 0.85 + 0.15 * Math.sin(t * 13 + seed) + 0.08 * Math.sin(t * 23 + seed * 3);
  const layers: Array<[string, number]> = [
    [color, 1],
    ["#ffb02e", 0.7],
    ["#fff2b0", 0.38],
  ];
  for (const [c, k] of layers) {
    const hh = h * k * f;
    const ww = w * k;
    const sway = Math.sin(t * 6 + seed) * ww * 0.12;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - ww / 2, y);
    ctx.quadraticCurveTo(x - ww / 2, y - hh * 0.55, x + sway, y - hh);
    ctx.quadraticCurveTo(x + ww / 2, y - hh * 0.55, x + ww / 2, y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Generic flames over an object that is burning. */
export function drawBurning(ctx: CanvasRenderingContext2D, arch: Archetype, t: number, seed: number) {
  const top = arch.anchor === "foot" ? -arch.h : -arch.h / 2;
  const n = Math.max(2, Math.min(6, Math.round(arch.w / 30)));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1 || 1) - 0.5) * arch.w * 0.7;
    const y = top + arch.h * (0.35 + 0.25 * rand(seed + i));
    flame(ctx, x, y, arch.w * 0.28, arch.h * 0.45, t, seed + i * 7);
  }
}

// ---------------------------------------------------------------- terrain
const terrain: Renderer = ({ ctx, item, arch, has, o, px }) => {
  const { w, h } = arch;
  const c = item.color;
  if (arch.layer === "background") {
    if (item.size === "huge" && has("heavy")) {
      // Mountain range: 1-3 peaks with lit/shaded faces.
      const peaks = 1 + (o.seed % 3);
      for (let i = 0; i < peaks; i++) {
        const k = peaks === 1 ? 0 : (i / (peaks - 1) - 0.5) * 0.55;
        const ph = h * (i === Math.floor(peaks / 2) ? 1 : 0.72 + 0.15 * rand(o.seed + i));
        const pw = w * (peaks === 1 ? 1 : 0.62);
        const cx = k * w;
        ctx.fillStyle = shade(c, -0.12);
        ctx.beginPath();
        ctx.moveTo(cx - pw / 2, 0);
        ctx.lineTo(cx, -ph);
        ctx.lineTo(cx + pw / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(c, 0.12);
        ctx.beginPath();
        ctx.moveTo(cx - pw / 2, 0);
        ctx.lineTo(cx, -ph);
        ctx.lineTo(cx - pw * 0.06, 0);
        ctx.closePath();
        ctx.fill();
        if (has("hot")) {
          // Volcano crater glow.
          ctx.fillStyle = "#ff5a1f";
          ctx.beginPath();
          ctx.ellipse(cx, -ph + 6, pw * 0.07, 6, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,110,40,0.85)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(cx - 4, -ph + 8);
          ctx.quadraticCurveTo(cx - pw * 0.08, -ph * 0.6, cx - pw * 0.15, -ph * 0.3);
          ctx.stroke();
        } else if (!has("heavy") || has("cold") || item.size === "huge") {
          ctx.fillStyle = has("cold") ? "#f4fbff" : "#f6f7fb";
          const sh = ph * 0.22;
          ctx.beginPath();
          ctx.moveTo(cx, -ph);
          ctx.lineTo(cx + (pw / 2) * (sh / ph), -ph + sh);
          ctx.lineTo(cx + pw * 0.03, -ph + sh * 0.8);
          ctx.lineTo(cx - pw * 0.04, -ph + sh * 1.05);
          ctx.lineTo(cx - (pw / 2) * (sh / ph), -ph + sh);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      // Rolling hill / dunes.
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.bezierCurveTo(-w * 0.3, -h * 1.05, w * 0.3, -h * 1.05, w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(c, 0.14);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.bezierCurveTo(-w * 0.32, -h * 0.95, -w * 0.05, -h * 0.85, w * 0.02, -h * 0.78);
      ctx.bezierCurveTo(-w * 0.15, -h * 0.5, -w * 0.3, -h * 0.2, -w * 0.25, 0);
      ctx.closePath();
      ctx.fill();
      if (!["⛰️", "🏔️", "🗻", "🌋", "🏞️"].includes(item.emoji)) {
        drawEmoji(ctx, item.emoji, w * 0.08, -h * 0.82, h * 0.32, px);
      }
    }
    return;
  }
  // Ground-level terrain: rocks or mounds.
  shadow(ctx, w, 0.14);
  if (has("heavy")) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, 0);
    ctx.lineTo(-w * 0.36, -h * 0.7);
    ctx.lineTo(-w * 0.05, -h);
    ctx.lineTo(w * 0.3, -h * 0.8);
    ctx.lineTo(w * 0.48, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(c, 0.18);
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, -h * 0.7);
    ctx.lineTo(-w * 0.05, -h);
    ctx.lineTo(-w * 0.02, -h * 0.45);
    ctx.lineTo(-w * 0.3, -h * 0.3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.bezierCurveTo(-w * 0.35, -h * 1.2, w * 0.35, -h * 1.2, w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(c, -0.18);
    for (let i = 0; i < 6; i++) {
      const rx = (rand(o.seed + i) - 0.5) * w * 0.6;
      const ry = -h * (0.15 + 0.5 * rand(o.seed + i * 3));
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(1.5, w * 0.02), 0, TAU);
      ctx.fill();
    }
    if (has("wet")) {
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.ellipse(-w * 0.12, -h * 0.68, w * 0.12, h * 0.07, -0.3, 0, TAU);
      ctx.fill();
    }
  }
};

// ---------------------------------------------------------------- water
const water: Renderer = ({ ctx, item, arch, o, t }) => {
  const { w, h } = arch;
  const frozen = (o.state.frozen ?? 0) > 0;
  const base = frozen ? "#cfeefd" : item.color;
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, shade(base, 0.18));
  g.addColorStop(1, shade(base, -0.15));
  ctx.fillStyle = shade(base, -0.3);
  ctx.beginPath();
  ctx.ellipse(0, 3, w / 2, h / 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (frozen) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x0 = (rand(o.seed + i) - 0.5) * w * 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, -h * 0.3);
      ctx.lineTo(x0 + w * 0.05, 0);
      ctx.lineTo(x0 - w * 0.03, h * 0.3);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    const rows = Math.max(2, Math.round(h / 22));
    for (let r = 0; r < rows; r++) {
      const yy = -h / 2 + ((r + 0.5) / rows) * h;
      const n = Math.max(2, Math.round(w / 140));
      for (let i = 0; i < n; i++) {
        const xx = ((i + (r % 2) * 0.5) / n - 0.5) * w + Math.sin(t * 0.8 + r + i + o.seed) * 14;
        const ww = 18 + 10 * Math.sin(t * 1.3 + i);
        ctx.beginPath();
        ctx.moveTo(xx - ww, yy);
        ctx.quadraticCurveTo(xx, yy - 5, xx + ww, yy);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  if (item.emoji !== "💧" && item.emoji !== "🌊" && !frozen) {
    // A hint of what kind of water this is (e.g. a lotus on a pond).
    drawEmoji(ctx, item.emoji, w * 0.28, -h * 0.05, Math.min(36, h * 0.7), 2);
  }
};

// ---------------------------------------------------------------- trees
function oneTree(ctx: CanvasRenderingContext2D, x: number, w: number, h: number, item: ItemDef, seed: number, t: number, charred: boolean, px: number) {
  const variant = item.emoji === "🌴" ? 3 : item.emoji === "🌲" ? 1 : seed % 3;
  const canopy = charred ? "#3b3836" : item.color;
  const trunk = charred ? "#2a2523" : "#7a5233";
  const sway = Math.sin(t * 1.2 + seed) * 0.035;
  ctx.save();
  ctx.translate(x, 0);
  ctx.fillStyle = trunk;
  if (variant === 3) {
    // Palm: curved trunk and fronds.
    ctx.strokeStyle = trunk;
    ctx.lineWidth = w * 0.11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w * 0.15, -h * 0.5, w * 0.05, -h * 0.85);
    ctx.stroke();
    ctx.translate(w * 0.05, -h * 0.85);
    ctx.rotate(sway * 2);
    ctx.fillStyle = canopy;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(-Math.PI / 2 + (i - 2.5) * 0.5);
      ctx.beginPath();
      ctx.ellipse(w * 0.32, 0, w * 0.34, w * 0.09, 0.25, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  ctx.fillRect(-w * 0.07, -h * 0.42, w * 0.14, h * 0.42);
  ctx.translate(0, -h * 0.35);
  ctx.rotate(sway);
  ctx.translate(0, h * 0.35);
  if (variant === 1) {
    for (let i = 0; i < 3; i++) {
      const y0 = -h * (0.22 + i * 0.24);
      const ww = w * (1 - i * 0.22);
      ctx.fillStyle = i % 2 ? shade(canopy, 0.08) : canopy;
      ctx.beginPath();
      ctx.moveTo(-ww / 2, y0);
      ctx.lineTo(0, y0 - h * 0.36);
      ctx.lineTo(ww / 2, y0);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const blobs: Array<[number, number, number]> =
      variant === 0
        ? [
            [-0.22, -0.55, 0.3],
            [0.2, -0.58, 0.3],
            [0, -0.75, 0.34],
            [0, -0.5, 0.3],
          ]
        : [
            [0, -0.5, 0.26],
            [0, -0.7, 0.3],
            [0, -0.86, 0.22],
          ];
    for (const [bx, by, br] of blobs) {
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(bx * w, by * h, br * w * (variant === 0 ? 1 : 1.25), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = rgba(shade(canopy, 0.35), 0.5);
    ctx.beginPath();
    ctx.arc(-w * 0.12, -h * 0.7, w * 0.14, 0, TAU);
    ctx.fill();
  }
  if (!charred && !["🌳", "🌲", "🌴", "🎄"].includes(item.emoji)) {
    // Fruit / identity: a few small emoji in the canopy.
    for (let i = 0; i < 3; i++) {
      drawEmoji(ctx, item.emoji, (i - 1) * w * 0.25, -h * (0.55 + 0.12 * (i % 2)), w * 0.24, px);
    }
  }
  ctx.restore();
}

const tree: Renderer = ({ ctx, item, arch, o, t, px }) => {
  const charred = !!o.state.charred;
  const big = item.size === "large" || item.size === "huge";
  if (!big) {
    shadow(ctx, arch.w * 0.9);
    oneTree(ctx, 0, arch.w, arch.h, item, o.seed, t, charred, px);
    return;
  }
  // Forests: a cluster of trees.
  shadow(ctx, arch.w, 0.15);
  const n = item.size === "huge" ? 7 : 5;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rand(o.seed + a) - rand(o.seed + b));
  for (const i of order) {
    const x = (i / (n - 1) - 0.5) * arch.w * 0.75;
    const k = 0.7 + 0.3 * rand(o.seed + i * 5);
    oneTree(ctx, x, arch.h * 0.5 * k, arch.h * k, item, o.seed + i, t, charred, px);
  }
};

// ---------------------------------------------------------------- plants
const plant: Renderer = ({ ctx, item, arch, o, t, has, px }) => {
  const { w, h } = arch;
  if (has("seed")) {
    const g = Math.min(1, o.state.growth ?? 0);
    ctx.fillStyle = "#6b4a2e";
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.6, h * 0.18, 0, Math.PI, 0);
    ctx.fill();
    if (g > 0.05) {
      ctx.strokeStyle = "#4caf50";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.1);
      ctx.lineTo(0, -h * (0.1 + g * 1.4));
      ctx.stroke();
      ctx.fillStyle = "#5cc85c";
      ctx.beginPath();
      ctx.ellipse(-6, -h * (0.1 + g * 1.4), 7 * g + 2, 3.5 * g + 1, -0.5, 0, TAU);
      ctx.ellipse(6, -h * (0.1 + g * 1.3), 7 * g + 2, 3.5 * g + 1, 0.5, 0, TAU);
      ctx.fill();
    }
    drawEmoji(ctx, item.emoji, w * 0.25, -h * 0.25, h * 0.55, px);
    return;
  }
  const charred = !!o.state.charred;
  const green = charred ? "#3a3634" : has("swimming") ? item.color : mix(item.color, "#4caf50", 0.55);
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const k = i / (blades - 1) - 0.5;
    const sway = Math.sin(t * 1.8 + o.seed + i) * w * 0.05;
    ctx.strokeStyle = i % 2 ? green : shade(green, -0.15);
    ctx.lineWidth = Math.max(2, w * 0.07);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(k * w * 0.3, 0);
    ctx.quadraticCurveTo(k * w * 0.6, -h * 0.4, k * w * 0.8 + sway, -h * (0.55 + 0.25 * (1 - Math.abs(k) * 2)));
    ctx.stroke();
  }
  if (!charred && !["🌱", "🌿", "☘️", "🍀"].includes(item.emoji)) {
    const sway = Math.sin(t * 1.8 + o.seed) * 2;
    drawEmoji(ctx, item.emoji, sway, -h * 0.75, h * 0.55, px);
    if (item.size !== "tiny") {
      drawEmoji(ctx, item.emoji, -w * 0.32, -h * 0.5, h * 0.4, px);
      drawEmoji(ctx, item.emoji, w * 0.32, -h * 0.55, h * 0.4, px);
    }
  }
};

// ---------------------------------------------------------------- buildings
function windowColor(dark: number, occupied: boolean) {
  if (dark > 0.35 || occupied) return "#ffd76a";
  return "#bfe3f5";
}

function building1(ctx: CanvasRenderingContext2D, w: number, h: number, c: string, seed: number, dark: number, occupied: boolean, kind: number) {
  const wall = c;
  const roof = shade(c, -0.35);
  if (kind === 0) {
    // House with pitched roof.
    const bh = h * 0.58;
    ctx.fillStyle = shade(wall, -0.1);
    ctx.fillRect(-w / 2, -bh, w, bh);
    ctx.fillStyle = wall;
    ctx.fillRect(-w / 2, -bh, w * 0.92, bh);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, -bh);
    ctx.lineTo(0, -h);
    ctx.lineTo(w * 0.6, -bh);
    ctx.closePath();
    ctx.fill();
    // chimney
    ctx.fillRect(w * 0.22, -h * 0.9, w * 0.1, h * 0.18);
    // door
    ctx.fillStyle = occupied ? "#ffcf6a" : shade(wall, -0.5);
    ctx.fillRect(-w * 0.09, -bh * 0.55, w * 0.18, bh * 0.55);
    // windows
    ctx.fillStyle = windowColor(dark, occupied);
    ctx.fillRect(-w * 0.38, -bh * 0.75, w * 0.18, bh * 0.25);
    ctx.fillRect(w * 0.2, -bh * 0.75, w * 0.18, bh * 0.25);
  } else {
    // Tower / block with a grid of windows.
    ctx.fillStyle = wall;
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = shade(wall, -0.12);
    ctx.fillRect(w * 0.25, -h, w * 0.25, h);
    if (kind === 2) {
      // battlements
      ctx.fillStyle = wall;
      for (let i = 0; i < 4; i++) ctx.fillRect(-w / 2 + (i * w) / 3.5, -h - h * 0.06, w * 0.16, h * 0.06);
    } else {
      ctx.fillStyle = roof;
      ctx.fillRect(-w * 0.52, -h - 4, w * 1.04, 6);
    }
    const cols = Math.max(2, Math.round(w / 22));
    const rows = Math.max(3, Math.round(h / 26));
    for (let r = 0; r < rows - 1; r++) {
      for (let col = 0; col < cols; col++) {
        const lit = rand(seed + r * 31 + col) > (dark > 0.35 ? 0.35 : 1.1);
        ctx.fillStyle = lit || occupied ? "#ffd76a" : windowColor(dark, false);
        const ww = (w / cols) * 0.5;
        ctx.fillRect(-w / 2 + (col + 0.25) * (w / cols), -h + (r + 0.6) * (h / rows), ww, (h / rows) * 0.45);
      }
    }
    ctx.fillStyle = shade(wall, -0.45);
    ctx.fillRect(-w * 0.1, -h * 0.12, w * 0.2, h * 0.12);
  }
}

const building: Renderer = ({ ctx, item, arch, o, dark, px }) => {
  const { w, h } = arch;
  const occupied = !!o.state.occupants;
  const c = o.state.charred ? "#4a4542" : item.color;
  shadow(ctx, w * 1.05, 0.16);
  if (item.size === "huge") {
    // Skyline / city: several towers.
    const n = 6;
    for (let i = 0; i < n; i++) {
      const bw = w / (n - 0.5);
      const bh = h * (0.45 + 0.55 * rand(o.seed + i * 13));
      ctx.save();
      ctx.translate(-w / 2 + bw * (i + 0.5) * 0.92, 0);
      building1(ctx, bw * 0.95, bh, shade(c, (rand(o.seed + i) - 0.5) * 0.25), o.seed + i, dark, occupied, 1);
      ctx.restore();
    }
  } else if (item.size === "large") {
    building1(ctx, w, h, c, o.seed, dark, occupied, o.seed % 2 ? 2 : 1);
  } else {
    building1(ctx, w, h, c, o.seed, dark, occupied, 0);
  }
  if (!["🏠", "🏡", "🏢", "🏙️", "🏘️"].includes(item.emoji)) {
    // Identity badge.
    const r = Math.min(w, h) * 0.17;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, r, 0, TAU);
    ctx.fill();
    drawEmoji(ctx, item.emoji, 0, -h * 0.5, r * 1.5, px);
  }
};

// ---------------------------------------------------------------- humans
const human: Renderer = ({ ctx, item, arch, o, t, moving, px, has }) => {
  const { w, h } = arch;
  const flying = arch.layer === "air";
  if (!flying) shadow(ctx, w * 1.1, 0.2);
  const walk = moving ? Math.sin(t * 10 + o.seed) : 0;
  const bob = moving ? Math.abs(walk) * h * 0.03 : Math.sin(t * 2 + o.seed) * h * 0.008;
  const legH = h * 0.3;
  const bodyH = h * 0.34;
  const headR = h * 0.2;
  const base = flying ? h / 2 : 0;
  ctx.save();
  ctx.translate(0, base - bob);
  // legs
  ctx.strokeStyle = shade(item.color, -0.45);
  ctx.lineWidth = Math.max(2, w * 0.16);
  ctx.lineCap = "round";
  if (!flying || !has("night")) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, -legH);
    ctx.lineTo(-w * 0.12 + walk * w * 0.22, 0);
    ctx.moveTo(w * 0.12, -legH);
    ctx.lineTo(w * 0.12 - walk * w * 0.22, 0);
    ctx.stroke();
  }
  // body
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.roundRect(-w * 0.32, -legH - bodyH, w * 0.64, bodyH + 2, w * 0.2);
  ctx.fill();
  // arms
  ctx.strokeStyle = shade(item.color, -0.15);
  ctx.lineWidth = Math.max(2, w * 0.13);
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -legH - bodyH * 0.8);
  ctx.lineTo(-w * 0.42 - walk * w * 0.1, -legH - bodyH * 0.15);
  ctx.moveTo(w * 0.3, -legH - bodyH * 0.8);
  ctx.lineTo(w * 0.42 + walk * w * 0.1, -legH - bodyH * 0.15);
  ctx.stroke();
  const headY = -legH - bodyH - headR * 0.75;
  if (isFaceEmoji(item.emoji)) {
    drawEmoji(ctx, item.emoji, 0, headY, headR * 2.5, px, o.dir > 0);
  } else {
    const skins = ["#f2c9a0", "#e0ac7e", "#c68a5a", "#8d5a3a", "#f5d6b8"];
    ctx.fillStyle = skins[o.seed % skins.length];
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ["#3a2a1a", "#d9a54a", "#6a3a1a", "#1a1a1a", "#b0b0b0"][(o.seed >> 3) % 5];
    ctx.beginPath();
    ctx.arc(0, headY - headR * 0.15, headR * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(o.dir * headR * 0.35, headY, Math.max(1, headR * 0.12), 0, TAU);
    ctx.fill();
    if (!["🧍", "🚶", "👪", "🧑"].includes(item.emoji)) {
      // Carry the emoji as a prop.
      drawEmoji(ctx, item.emoji, o.dir * w * 0.55, -legH - bodyH * 0.2, h * 0.32, px);
    }
  }
  ctx.restore();
};

// ---------------------------------------------------------------- animals
const animal: Renderer = ({ ctx, item, arch, o, t, moving, px }) => {
  const { w, h } = arch;
  const flying = arch.layer === "air";
  if (flying) {
    const flap = Math.sin(t * 9 + o.seed);
    ctx.save();
    ctx.scale(1, 1 + flap * 0.06);
    drawEmoji(ctx, item.emoji, 0, 0, h, px, o.dir > 0);
    ctx.restore();
    return;
  }
  shadow(ctx, w * 0.8, 0.2);
  const hop = moving ? Math.abs(Math.sin(t * 8 + o.seed)) * h * 0.1 : 0;
  const squash = moving ? 1 + Math.sin(t * 16 + o.seed) * 0.03 : 1 + Math.sin(t * 2 + o.seed) * 0.015;
  ctx.save();
  ctx.translate(0, -hop);
  ctx.scale(1 / squash, squash);
  drawEmoji(ctx, item.emoji, 0, -h * 0.5, h, px, o.dir > 0);
  ctx.restore();
};

// ---------------------------------------------------------------- vehicles
const vehicle: Renderer = ({ ctx, item, arch, o, t, moving, px }) => {
  const { w, h } = arch;
  const flying = arch.layer === "air";
  if (!flying) shadow(ctx, w * 0.9, 0.22);
  const rumble = moving ? Math.sin(t * 30 + o.seed) * 0.8 : 0;
  const y = flying ? 0 : -h * 0.48 + rumble;
  drawEmoji(ctx, item.emoji, 0, y, Math.min(w, h * 1.25), px, o.dir > 0);
  if (o.state.riderItemId) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(0, y - h * 0.62, h * 0.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#3a3a3a";
    ctx.font = `bold ${Math.round(h * 0.2)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪", 0, y - h * 0.62);
  }
};

// ---------------------------------------------------------------- weather
function cloudShape(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number) {
  const puffs = 5;
  ctx.fillStyle = shade(color, -0.08);
  ctx.beginPath();
  ctx.roundRect(-w * 0.45, -h * 0.05, w * 0.9, h * 0.38, h * 0.2);
  ctx.fill();
  ctx.fillStyle = color;
  for (let i = 0; i < puffs; i++) {
    const k = i / (puffs - 1) - 0.5;
    const r = h * (0.3 + 0.22 * (1 - Math.abs(k) * 1.6) + 0.06 * rand(seed + i));
    ctx.beginPath();
    ctx.arc(k * w * 0.72, -h * 0.02 - r * 0.35, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(-w * 0.12, -h * 0.32, h * 0.22, 0, TAU);
  ctx.fill();
}

const weather: Renderer = ({ ctx, item, arch, o, t, has }) => {
  const { w, h } = arch;
  const wet = has("wet") || (o.state.raining ?? 0) > 0;
  const cold = has("cold");
  const electric = has("electric");
  const groundY = WORLD.HORIZON + 260 - o.y; // local y of the ground below the cloud
  if (has("light") && !electric && !wet) {
    // Rainbow arc.
    const colors = ["#ff5a5a", "#ffa54a", "#ffe14a", "#5ad46a", "#4aa8ff", "#8a6aff"];
    ctx.lineWidth = h * 0.09;
    colors.forEach((c, i) => {
      ctx.strokeStyle = rgba(c, 0.75);
      ctx.beginPath();
      ctx.arc(0, h * 0.6, w * 0.5 - i * h * 0.09, Math.PI, 0);
      ctx.stroke();
    });
    return;
  }
  if (item.size === "tiny" || (item.size === "small" && !wet && !cold && !electric)) {
    // Wind: animated streaks.
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const phase = (t * 0.6 + i * 0.27 + o.seed * 0.01) % 1;
      const x = (phase - 0.5) * w * 1.4;
      const y = (i - 1.5) * h * 0.35;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, y);
      ctx.bezierCurveTo(x - w * 0.1, y - 10, x + w * 0.05, y + 8, x + w * 0.12, y - 4);
      ctx.arc(x + w * 0.12, y - 12, 8, Math.PI / 2, -Math.PI * 0.6, true);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  // Precipitation below the cloud.
  if (wet || cold) {
    const n = Math.round(w / 9);
    const fall = Math.max(120, groundY);
    ctx.strokeStyle = cold ? "rgba(255,255,255,0.9)" : "rgba(170,200,235,0.75)";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const xi = (rand(o.seed + i * 17) - 0.5) * w * 0.85;
      const speed = cold ? 70 : 620;
      const yi = ((t * speed + rand(o.seed + i) * fall) % fall) + h * 0.15;
      if (cold) {
        const sx = xi + Math.sin(t * 2 + i) * 8;
        ctx.beginPath();
        ctx.arc(sx, yi, 2.6, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(xi, yi);
        ctx.lineTo(xi - 3, yi + 14);
        ctx.stroke();
      }
    }
  }
  const color = electric ? "#5d6a7d" : wet ? mix(item.color, "#9aa8b8", 0.4) : item.color;
  cloudShape(ctx, w, h, color, o.seed);
  if (electric && o.state.boltAt !== undefined && t - o.state.boltAt < 0.18) {
    ctx.strokeStyle = "#fff7a0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    let x = (rand(Math.floor(o.state.boltAt * 10)) - 0.5) * w * 0.6;
    let y = h * 0.2;
    ctx.moveTo(x, y);
    while (y < groundY) {
      y += 30;
      x += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (item.emoji !== "☁️" && item.emoji !== "🌧️" && item.emoji !== "⛈️") {
    drawEmoji(ctx, item.emoji, 0, -h * 0.1, h * 0.45, 2);
  }
};

// ---------------------------------------------------------------- celestial
const celestial: Renderer = ({ ctx, item, arch, o, t, has, px, dark }) => {
  const r = arch.w / 2;
  const c = item.color;
  if (has("light") && (has("hot") || item.emoji === "☀️")) {
    // Sun: glow + rotating rays.
    const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.2);
    g.addColorStop(0, rgba(c, 0.55));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(shade(c, 0.2), 0.8);
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.15;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      ctx.stroke();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.35);
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, TAU);
    ctx.fill();
    return;
  }
  if (has("night") && has("heavy")) {
    // Black hole: accretion disk.
    ctx.save();
    ctx.rotate(-0.25);
    ctx.strokeStyle = "rgba(255,150,60,0.85)";
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5, r * 0.45, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.1);
    g.addColorStop(0, "#000");
    g.addColorStop(1, "rgba(120,80,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.1, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.rotate(-0.25);
    ctx.strokeStyle = "rgba(255,200,120,0.9)";
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5, r * 0.45, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (item.size === "huge" && has("light")) {
    // Galaxy spiral.
    for (let i = 0; i < 140; i++) {
      const k = i / 140;
      const arm = i % 2 ? 0 : Math.PI;
      const a = arm + k * 5 + t * 0.05;
      const rr = k * r * 1.2;
      ctx.fillStyle = rgba(mix(c, "#ffffff", 1 - k), 0.85 - k * 0.5);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.55, 1.5 + (1 - k) * 2.5, 0, TAU);
      ctx.fill();
    }
    return;
  }
  if (has("light") && item.size !== "large") {
    // Star / comet: twinkling sparkle (+ tail if it moves).
    const tw = 0.8 + 0.2 * Math.sin(t * 4 + o.seed);
    if (has("flying")) {
      const g = ctx.createLinearGradient(0, 0, r * 4, -r * 1.2);
      g.addColorStop(0, rgba(c, 0.8));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(r * 4, -r * 1.6);
      ctx.lineTo(0, r * 0.4);
      ctx.fill();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rr = (i % 2 ? r * 0.3 : r) * tw;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (has("night") && !has("cold") && !["🌙", "🌕", "🌛", "🌜", "🌝"].includes(item.emoji)) {
    // Nebula / space patch.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
    g.addColorStop(0, rgba(shade(c, 0.3), 0.9));
    g.addColorStop(0.6, rgba(c, 0.6));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i);
      ctx.fillRect((rand(o.seed + i) - 0.5) * r * 2.4, (rand(o.seed + i * 7) - 0.5) * r * 2.4, 2, 2);
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (has("night")) {
    // Moon with craters and a soft glow.
    const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.9);
    g.addColorStop(0, rgba(c, 0.35 + dark * 0.3));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(c, -0.12);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc((rand(o.seed + i) - 0.5) * r, (rand(o.seed + i * 5) - 0.5) * r, r * (0.1 + 0.1 * rand(i)), 0, TAU);
      ctx.fill();
    }
    return;
  }
  // Planet: shaded sphere, optional ring.
  const ringed = o.seed % 2 === 0 && item.size !== "small" && item.size !== "tiny";
  if (ringed) {
    ctx.strokeStyle = rgba(shade(c, 0.3), 0.8);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.6, r * 0.38, -0.3, Math.PI, TAU);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(c, 0.35));
  g.addColorStop(1, shade(c, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  if (ringed) {
    ctx.strokeStyle = rgba(shade(c, 0.3), 0.9);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.6, r * 0.38, -0.3, 0, Math.PI);
    ctx.stroke();
  }
  if (!["🪐", "🌍", "🌎", "🌏", "🔴", "🟠", "🟤", "🔵"].includes(item.emoji)) {
    drawEmoji(ctx, item.emoji, 0, 0, r * 1.1, px);
  }
};

// ---------------------------------------------------------------- fire
const fire: Renderer = ({ ctx, item, arch, o, t, has }) => {
  const { w, h } = arch;
  if (has("heavy")) {
    // Lava pool.
    const g = ctx.createRadialGradient(0, -h * 0.15, 4, 0, -h * 0.15, w * 0.5);
    g.addColorStop(0, "#ffe16a");
    g.addColorStop(0.5, item.color);
    g.addColorStop(1, shade(item.color, -0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.15, w / 2, h * 0.3, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i / 3) % 1;
      ctx.fillStyle = `rgba(255,230,120,${1 - p})`;
      ctx.beginPath();
      ctx.arc((rand(o.seed + i) - 0.5) * w * 0.6, -h * 0.15, 3 + p * 8, 0, TAU);
      ctx.fill();
    }
    return;
  }
  // Shrinks while being doused and as the fuel runs out.
  const doused = Math.max(Math.min(1, (o.state.doused ?? 0) / 3), o.state.fuel !== undefined ? 1 - Math.min(1, o.state.fuel / 25) : 0);
  if (item.category === "structure" || item.size !== "tiny") {
    ctx.fillStyle = "#6b4426";
    ctx.save();
    ctx.rotate(0.25);
    ctx.fillRect(-w * 0.45, -6, w * 0.9, 8);
    ctx.restore();
    ctx.save();
    ctx.rotate(-0.25);
    ctx.fillRect(-w * 0.45, -6, w * 0.9, 8);
    ctx.restore();
  }
  flame(ctx, 0, -2, w * (1 - doused * 0.6), h * (1 - doused * 0.7), t, o.seed, item.color);
};

// ---------------------------------------------------------------- particles (smoke, steam, dust, explosions…)
const particle: Renderer = ({ ctx, item, arch, o, t, has, px }) => {
  const { w, h } = arch;
  const rising = has("flying") || has("hot") || !has("heavy");
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p = (t * 0.35 + i / n + o.seed * 0.013) % 1;
    const x = Math.sin(i * 2.1 + t * 0.7) * w * 0.25 * (0.4 + p);
    const y = rising ? -p * h : -h * 0.2 - Math.sin(p * Math.PI) * h * 0.3;
    const r = w * (0.12 + p * 0.22);
    ctx.fillStyle = rgba(item.color, (1 - p) * 0.75);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  if (has("light")) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 2;
      const rr = w * (0.25 + 0.15 * Math.sin(t * 5 + i));
      ctx.fillStyle = rgba("#fff6b0", 0.9);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, -h * 0.45 + Math.sin(a) * rr, 3, 0, TAU);
      ctx.fill();
    }
  }
  drawEmoji(ctx, item.emoji, 0, -h * 0.3, w * 0.42, px);
};

// ---------------------------------------------------------------- decorations / machines / food / objects
const decoration: Renderer = ({ ctx, item, arch, o, t, px, has }) => {
  const { w, h } = arch;
  if (has("rail")) {
    // Railway track (flat layer, centered).
    ctx.fillStyle = "#7a5a3a";
    const n = Math.round(w / 22);
    for (let i = 0; i < n; i++) ctx.fillRect(-w / 2 + i * (w / n) + 3, -h / 2, 8, h);
    ctx.strokeStyle = "#9aa2ad";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.25);
    ctx.lineTo(w / 2, -h * 0.25);
    ctx.moveTo(-w / 2, h * 0.25);
    ctx.lineTo(w / 2, h * 0.25);
    ctx.stroke();
    return;
  }
  shadow(ctx, w * 0.8, 0.18);
  if (has("wet")) {
    // Fountain-style droplets.
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.9 + i / 6) % 1;
      const side = i % 2 ? 1 : -1;
      ctx.fillStyle = `rgba(160,210,255,${1 - p})`;
      ctx.beginPath();
      ctx.arc(side * p * w * 0.4, -h * 0.9 - Math.sin(p * Math.PI) * h * 0.35, 3, 0, TAU);
      ctx.fill();
    }
  }
  const wobble = item.worldType === "machine" ? Math.sin(t * 20 + o.seed) * 0.6 : 0;
  drawEmoji(ctx, item.emoji, wobble, -h * 0.5, h, px);
  if (item.worldType === "machine" && has("electric") && Math.sin(t * 3 + o.seed) > 0.92) {
    ctx.strokeStyle = "#fff27a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, -h * 0.8);
    ctx.lineTo(w * 0.4, -h * 0.95);
    ctx.lineTo(w * 0.33, -h * 0.98);
    ctx.lineTo(w * 0.45, -h * 1.12);
    ctx.stroke();
  }
};

const abstract: Renderer = ({ ctx, item, arch, o, t, px }) => {
  const { w, h } = arch;
  const lift = h * 0.55 + Math.sin(t * 1.5 + o.seed) * 6;
  shadow(ctx, w * 0.5, 0.1);
  const g = ctx.createRadialGradient(0, -lift, 2, 0, -lift, w * 0.75);
  g.addColorStop(0, rgba(shade(item.color, 0.4), 0.95));
  g.addColorStop(0.6, rgba(item.color, 0.45));
  g.addColorStop(1, rgba(item.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -lift, w * 0.75, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = t * 1.4 + (i / 4) * TAU;
    ctx.fillStyle = rgba("#ffffff", 0.85);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * w * 0.55, -lift + Math.sin(a) * w * 0.25, 2.2, 0, TAU);
    ctx.fill();
  }
  drawEmoji(ctx, item.emoji, 0, -lift, h * 0.62, px);
};

const simpleObject: Renderer = ({ ctx, item, arch, o, t, px }) => {
  const { w, h } = arch;
  if (arch.layer === "air") {
    drawEmoji(ctx, item.emoji, 0, Math.sin(t * 2 + o.seed) * 4, h, px);
    return;
  }
  shadow(ctx, w * 0.75, 0.2);
  drawEmoji(ctx, item.emoji, 0, -h * 0.5, h, px);
};

export const RENDERERS: Record<WorldType, Renderer> = {
  terrain,
  water,
  tree,
  plant,
  building,
  human,
  animal,
  vehicle,
  weather,
  celestial,
  fire,
  particle,
  decoration,
  machine: decoration,
  food: simpleObject,
  object: simpleObject,
  abstract,
};
