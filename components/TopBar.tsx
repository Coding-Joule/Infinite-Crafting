"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/lib/game/store";
import { useUI } from "@/lib/game/ui";
import { getEngine } from "@/lib/game/drag";
import { KEYS, removeKey } from "@/lib/game/persistence";

export function TopBar() {
  const count = useGame((s) => Object.keys(s.discoveries).length);
  const worldCount = useGame((s) => s.worldCount);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const aiEnabled = useGame((s) => s.aiEnabled);
  const menuOpen = useUI((s) => s.menuOpen);
  const drawerOpen = useUI((s) => s.drawerOpen);
  const setUI = useUI((s) => s.set);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setUI({ menuOpen: false });
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen, setUI]);

  const newWorld = () =>
    setUI({
      menuOpen: false,
      confirm: {
        title: "Start a new world?",
        body: `This removes all ${worldCount} things placed in your world. Your discoveries stay.`,
        confirmLabel: "New world",
        danger: true,
        onConfirm: () => {
          getEngine()?.clear();
          getEngine()?.resetCamera();
        },
      },
    });

  const resetAll = () =>
    setUI({
      menuOpen: false,
      confirm: {
        title: "Erase everything?",
        body: `This forgets all ${count} discoveries, your recipes, favorites and your world. It cannot be undone.`,
        confirmLabel: "Erase everything",
        danger: true,
        onConfirm: () => {
          getEngine()?.clear();
          getEngine()?.resetCamera();
          useGame.getState().resetProgress();
          removeKey(KEYS.world);
        },
      },
    });

  return (
    <header className="topbar">
      <button className="icon-btn drawer-toggle" onClick={() => setUI({ drawerOpen: !drawerOpen })} aria-label="Toggle discoveries">
        🎒
      </button>
      <div className="brand">
        <span className="brand__globe" aria-hidden>
          🌍
        </span>
        <span className="brand__name">
          Infinite <em>World</em>
        </span>
      </div>
      <div className="topbar__stats">
        <span className="stat" title="Things you have discovered">
          ✨ <b>{count}</b> <span className="stat__label">discoveries</span>
        </span>
        <span className="stat stat--soft" title="Things living in your world">
          🗺️ <b>{worldCount}</b> <span className="stat__label">in world</span>
        </span>
      </div>
      <div className="topbar__actions">
        <button
          className="icon-btn"
          onClick={() => setSettings({ dayCycle: !settings.dayCycle })}
          title={settings.dayCycle ? "Day/night cycle on" : "Always day"}
          aria-label="Toggle day and night"
        >
          {settings.dayCycle ? "🌗" : "☀️"}
        </button>
        <button
          className="icon-btn"
          onClick={() => setSettings({ muted: !settings.muted })}
          title={settings.muted ? "Sound off" : "Sound on"}
          aria-label="Toggle sound"
        >
          {settings.muted ? "🔇" : "🔊"}
        </button>
        <div className="menu" ref={menuRef}>
          <button className="icon-btn" onClick={() => setUI({ menuOpen: !menuOpen })} aria-label="Settings" aria-expanded={menuOpen}>
            ⚙️
          </button>
          {menuOpen && (
            <div className="menu__panel" role="menu">
              <button role="menuitem" onClick={newWorld}>
                🌱 New world…
              </button>
              <button role="menuitem" className="danger" onClick={resetAll}>
                🧨 Erase all progress…
              </button>
              <div className="menu__help">
                <b>Controls</b>
                <span>Drag empty space to pan · scroll or pinch to zoom</span>
                <span>Hold a thing over another to combine them</span>
                <span>Del removes · Ctrl/⌘+D duplicates</span>
              </div>
              <div className="menu__engine">
                {aiEnabled === null ? "…" : aiEnabled ? "✨ AI combination engine online" : "🧩 Built-in combination engine (no AI key set)"}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
