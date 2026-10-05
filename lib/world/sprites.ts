// Small rendering helpers: cached emoji sprites and color math.

const spriteCache = new Map<string, HTMLCanvasElement>();
const BUCKETS = [16, 24, 32, 48, 64, 96, 128, 192, 256];

/**
 * Returns a cached canvas with the emoji rendered at roughly `px` device pixels.
 * Rendering emoji text every frame is slow; drawing a cached bitmap is fast.
 */
export function emojiSprite(emoji: string, px: number): HTMLCanvasElement {
  const bucket = BUCKETS.find((b) => b >= px) ?? 256;
  const key = emoji + "|" + bucket;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  const pad = Math.ceil(bucket * 0.25);
  c.width = c.height = bucket + pad * 2;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${bucket}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.fillText(emoji, c.width / 2, c.height / 2 + bucket * 0.06);
  if (spriteCache.size > 600) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

/** Draw an emoji centered at (x, y) with world size `size`. */
export function drawEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  size: number,
  pixelScale: number,
  flip = false,
) {
  const sprite = emojiSprite(emoji, size * pixelScale);
  const scale = size / (sprite.width / 1.5);
  const s = sprite.width * scale;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}

/** amount > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  const k = 1 + amount;
  return rgbToHex(r * k, g * k, b * k);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** True if the emoji depicts a face/character that works as a person's head. */
export function isFaceEmoji(emoji: string): boolean {
  const cp = emoji.codePointAt(0) ?? 0;
  if (cp === 0x1f9cd || cp === 0x1f6b6 || cp === 0x1f46a) return false;
  return (
    (cp >= 0x1f466 && cp <= 0x1f487) ||
    (cp >= 0x1f600 && cp <= 0x1f64f) ||
    (cp >= 0x1f9d1 && cp <= 0x1f9df) ||
    (cp >= 0x1f930 && cp <= 0x1f93e) ||
    (cp >= 0x1f9b8 && cp <= 0x1f9b9) ||
    (cp >= 0x1f920 && cp <= 0x1f92f) ||
    cp === 0x1f977 ||
    cp === 0x1f916 ||
    cp === 0x1f383 ||
    cp === 0x1f385 ||
    cp === 0x1f9db ||
    cp === 0x1f47b ||
    cp === 0x1f47d ||
    cp === 0x1f47e ||
    cp === 0x1f479 ||
    cp === 0x1f47a
  );
}
