"use client";

import { useGame } from "./store";

// Tiny synthesized sound effects via WebAudio — no audio files needed.
let ctx: AudioContext | null = null;
let lastPlayed: Record<string, number> = {};

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, gain: number, freq = 1200) {
  const ac = audio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

export type SoundName =
  | "pick"
  | "drop"
  | "combine"
  | "discover"
  | "place"
  | "delete"
  | "ignite"
  | "splash"
  | "pop"
  | "zap"
  | "munch"
  | "error";

export function sfx(name: SoundName | string) {
  if (useGame.getState().settings.muted) return;
  const now = performance.now();
  // Throttle repeated ambient sounds.
  const minGap = ["ignite", "splash", "zap", "munch", "pop", "place"].includes(name) ? 250 : 40;
  if (now - (lastPlayed[name] ?? 0) < minGap) return;
  lastPlayed[name] = now;
  try {
    switch (name) {
      case "pick":
        tone(520, 0.08, "sine", 0.05);
        break;
      case "drop":
        tone(330, 0.1, "sine", 0.05, 0, 0.7);
        break;
      case "place":
        tone(260, 0.12, "triangle", 0.07, 0, 0.6);
        break;
      case "combine":
        tone(440, 0.09, "triangle", 0.06);
        tone(660, 0.12, "triangle", 0.06, 0.07);
        break;
      case "discover":
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.07, i * 0.07));
        break;
      case "delete":
        tone(300, 0.15, "sawtooth", 0.03, 0, 0.4);
        break;
      case "ignite":
        noise(0.35, 0.08, 900);
        break;
      case "splash":
        noise(0.25, 0.06, 2400);
        break;
      case "pop":
        tone(700, 0.06, "sine", 0.06, 0, 1.6);
        break;
      case "zap":
        noise(0.15, 0.1, 5000);
        tone(120, 0.3, "sawtooth", 0.04, 0, 0.5);
        break;
      case "munch":
        noise(0.08, 0.06, 1500);
        noise(0.08, 0.06, 1500);
        break;
      case "error":
        tone(200, 0.15, "square", 0.03);
        break;
    }
  } catch {
    /* audio unavailable */
  }
}

/** Reset throttle (tests / new world). */
export function resetSoundThrottle() {
  lastPlayed = {};
}
