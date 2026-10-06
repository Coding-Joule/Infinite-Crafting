"use client";

import { useEffect, useState } from "react";
import { getEngine } from "@/lib/game/drag";
import { useUI } from "@/lib/game/ui";

/** Day counter and in-game clock. */
export function WorldClock() {
  const [clock, setClock] = useState<{ day: number; hours: number; minutes: number; night: boolean } | null>(null);
  useEffect(() => {
    const tick = () => setClock(getEngine()?.clock() ?? null);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, []);
  if (!clock) return null;
  const hh = String(clock.hours).padStart(2, "0");
  const mm = String(Math.floor(clock.minutes / 10) * 10).padStart(2, "0");
  const icon = clock.night ? "🌙" : clock.hours < 8 ? "🌅" : clock.hours >= 18 ? "🌇" : "☀️";
  return (
    <div className="world__clock" aria-label={`Day ${clock.day}, ${hh}:${mm}`}>
      <span>{icon}</span>
      <b>Day {clock.day}</b>
      <span className="world__time">
        {hh}:{mm}
      </span>
    </div>
  );
}

/** Ticker of things happening in the world (births, deaths, fires…). */
export function WorldNews() {
  const news = useUI((s) => s.news);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const visible = news.filter((n) => now - n.at < 9000).slice(-4);
  if (!visible.length) return null;
  return (
    <ul className="world__news" aria-live="polite">
      {visible.map((n) => (
        <li key={n.id} style={{ opacity: now - n.at > 7000 ? 0.4 : 1 }}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}
